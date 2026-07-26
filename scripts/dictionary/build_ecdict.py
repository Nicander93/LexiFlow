#!/usr/bin/env python3
"""Build a compact ECDICT SQLite database for LexiFlow."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

QUALITY_TAGS = {"zk", "gk", "cet4", "cet6", "ky", "ielts", "toefl", "gre"}
EXCHANGE_CODES = {"p", "d", "i", "3", "r", "t", "s", "0"}
LETTER_RE = re.compile(r"[A-Za-z]")
SENTENCE_END_RE = re.compile(r"[.?!]$")


def strip_word_key(word: str) -> str:
    return "".join(ch for ch in word if ch.isalnum()).lower()


def load_allowlist(path: Path) -> set[str]:
    if not path.exists():
        return set()
    items: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        item = line.strip()
        if item and not item.startswith("#"):
            items.add(item.casefold())
    return items


def parse_int(value: str | None) -> int:
    if value is None:
        return 0
    text = value.strip()
    if not text:
        return 0
    try:
        return int(float(text))
    except ValueError:
        return 0


def is_quality_entry(row: dict[str, str], allowlist: set[str]) -> bool:
    translation = (row.get("translation") or "").strip()
    if not translation:
        return False

    word = (row.get("word") or "").strip()
    if not (1 <= len(word) <= 64):
        return False
    if "\n" in word or "\r" in word:
        return False
    if not LETTER_RE.search(word):
        return False

    tokens = [token for token in word.split(" ") if token]
    if len(tokens) > 4:
        return False
    if len(tokens) >= 3 and SENTENCE_END_RE.search(word):
        return False

    tags = set((row.get("tag") or "").lower().split())
    oxford = parse_int(row.get("oxford"))
    collins = parse_int(row.get("collins"))
    bnc = parse_int(row.get("bnc"))
    frq = parse_int(row.get("frq"))

    if tags & QUALITY_TAGS:
        return True
    if oxford > 0 or collins > 0:
        return True
    if 0 < bnc <= 50000 or 0 < frq <= 50000:
        return True
    if word.casefold() in allowlist:
        return True
    return False


def parse_forms(exchange: str, word: str) -> list[tuple[str, str, str]]:
    forms: list[tuple[str, str, str]] = []
    if not exchange:
        return forms
    for part in exchange.split("/"):
        part = part.strip()
        if not part or ":" not in part:
            continue
        code, value = part.split(":", 1)
        code = code.strip()
        value = value.strip()
        if not code or not value or code == "1":
            continue
        if code == "0":
            forms.append((word, value, code))
        elif code in EXCHANGE_CODES:
            forms.append((value, word, code))
    return forms


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE metadata (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE entries (
          id          INTEGER PRIMARY KEY,
          word        TEXT NOT NULL COLLATE NOCASE UNIQUE,
          sw          TEXT NOT NULL,
          phonetic    TEXT,
          definition  TEXT,
          translation TEXT NOT NULL,
          pos         TEXT,
          collins     INTEGER NOT NULL DEFAULT 0,
          oxford      INTEGER NOT NULL DEFAULT 0,
          tag         TEXT,
          bnc         INTEGER,
          frq         INTEGER,
          exchange    TEXT
        );

        CREATE INDEX idx_entries_word ON entries(word COLLATE NOCASE);
        CREATE INDEX idx_entries_sw ON entries(sw, word COLLATE NOCASE);

        CREATE TABLE forms (
          form      TEXT NOT NULL COLLATE NOCASE,
          lemma     TEXT NOT NULL COLLATE NOCASE,
          relation  TEXT NOT NULL,
          PRIMARY KEY(form, lemma, relation)
        );

        CREATE INDEX idx_forms_form ON forms(form COLLATE NOCASE);
        """
    )


def iter_csv_rows(input_path: Path):
    with input_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"word", "translation"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise SystemExit("CSV must include word and translation columns")
        yield from reader


def iter_sqlite_rows(input_path: Path):
    source = sqlite3.connect(f"file:{input_path.as_posix()}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    try:
        tables = {
            name
            for (name,) in source.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        table = "stardict" if "stardict" in tables else "entries" if "entries" in tables else None
        if not table:
            raise SystemExit("SQLite source must contain stardict or entries table")
        for row in source.execute(
            f"""
            SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange
            FROM {table}
            """
        ):
            yield {key: ("" if row[key] is None else str(row[key])) for key in row.keys()}
    finally:
        source.close()


def iter_source_rows(input_path: Path):
    suffix = input_path.suffix.lower()
    if suffix in {".db", ".sqlite", ".sqlite3"}:
        yield from iter_sqlite_rows(input_path)
    else:
        yield from iter_csv_rows(input_path)


def flush_entries(conn: sqlite3.Connection, batch_entries: list[tuple]) -> int:
    if not batch_entries:
        return 0
    conn.executemany(
        """
        INSERT OR IGNORE INTO entries
        (word, sw, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        batch_entries,
    )
    count = len(batch_entries)
    batch_entries.clear()
    return count


def build(input_path: Path, output_path: Path, allowlist_path: Path, dictionary_version: str) -> dict:
    allowlist = load_allowlist(allowlist_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    source_entries = 0
    included_entries = 0
    excluded_entries = 0
    forms_generated = 0
    exchange_skipped = 0

    conn = sqlite3.connect(output_path)
    try:
        create_schema(conn)
        batch_entries: list[tuple] = []
        batch_forms: list[tuple[str, str, str]] = []

        for row in iter_source_rows(input_path):
            source_entries += 1
            if not is_quality_entry(row, allowlist):
                excluded_entries += 1
                continue

            word = (row.get("word") or "").strip()
            translation = (row.get("translation") or "").strip()
            batch_entries.append(
                (
                    word,
                    strip_word_key(word),
                    (row.get("phonetic") or "").strip() or None,
                    (row.get("definition") or "").strip() or None,
                    translation,
                    (row.get("pos") or "").strip() or None,
                    parse_int(row.get("collins")),
                    parse_int(row.get("oxford")),
                    (row.get("tag") or "").strip() or None,
                    parse_int(row.get("bnc")) or None,
                    parse_int(row.get("frq")) or None,
                    (row.get("exchange") or "").strip() or None,
                )
            )
            try:
                batch_forms.extend(parse_forms((row.get("exchange") or "").strip(), word))
            except Exception:
                exchange_skipped += 1

            if len(batch_entries) >= 1000:
                included_entries += flush_entries(conn, batch_entries)

        included_entries += flush_entries(conn, batch_entries)

        if batch_forms:
            before = conn.execute("SELECT COUNT(*) FROM forms").fetchone()[0]
            conn.executemany(
                "INSERT OR IGNORE INTO forms (form, lemma, relation) VALUES (?, ?, ?)",
                batch_forms,
            )
            after = conn.execute("SELECT COUNT(*) FROM forms").fetchone()[0]
            forms_generated = after - before

        actual_entries = conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
        actual_forms = conn.execute("SELECT COUNT(*) FROM forms").fetchone()[0]
        generated_at = datetime.now(timezone.utc).isoformat()
        conn.executemany(
            "INSERT INTO metadata (key, value) VALUES (?, ?)",
            [
                ("schema_version", "1"),
                ("dictionary_version", dictionary_version),
                ("source", "ECDICT"),
                ("source_commit_or_date", dictionary_version),
                ("entry_count", str(actual_entries)),
                ("form_count", str(actual_forms)),
                ("generated_at", generated_at),
                ("sha256", ""),
            ],
        )
        conn.commit()
    finally:
        conn.close()

    # Hash the DB before writing digest; metadata and manifest share this content digest.
    digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
    conn = sqlite3.connect(output_path)
    try:
        conn.execute("UPDATE metadata SET value = ? WHERE key = 'sha256'", (digest,))
        conn.commit()
    finally:
        conn.close()

    size = output_path.stat().st_size
    stats = {
        "schemaVersion": 1,
        "dictionaryVersion": dictionary_version,
        "source": "ECDICT",
        "entryCount": actual_entries,
        "formCount": actual_forms,
        "generatedAt": generated_at,
        "sha256": digest,
        "sourceEntries": source_entries,
        "includedEntries": included_entries,
        "excludedEntries": excluded_entries,
        "formsGenerated": forms_generated,
        "exchangeSkipped": exchange_skipped,
        "databaseSize": size,
    }

    print(f"source entries: {source_entries}")
    print(f"included entries: {actual_entries}")
    print(f"excluded entries: {excluded_entries}")
    print(f"forms generated: {actual_forms}")
    print(f"database size: {size}")
    print(f"sha256: {digest}")
    if exchange_skipped:
        print(f"exchange skipped: {exchange_skipped}", file=sys.stderr)

    manifest_path = output_path.with_name("manifest.json")
    manifest_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "dictionaryVersion": dictionary_version,
                "source": "ECDICT",
                "entryCount": actual_entries,
                "formCount": actual_forms,
                "generatedAt": generated_at,
                "sha256": digest,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Build LexiFlow ECDICT core SQLite dictionary")
    parser.add_argument("--input", required=True, type=Path, help="ECDICT CSV or SQLite (stardict.db)")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--allowlist",
        type=Path,
        default=Path("resources/dictionaries/core-allowlist.txt"),
    )
    parser.add_argument("--dictionary-version", default="2026.07")
    args = parser.parse_args()
    build(args.input, args.output, args.allowlist, args.dictionary_version)


if __name__ == "__main__":
    main()
