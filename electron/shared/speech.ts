export type SpeechStatus = "idle" | "speaking" | "error" | "unavailable";

export interface SpeechSnapshot {
  status: SpeechStatus;
  text: string;
  language: string;
  owner?: symbol;
  error?: string;
}

interface SpeechEngine {
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  speak(utterance: SpeechSynthesisUtterance): void;
  addEventListener?(type: "voiceschanged", listener: () => void): void;
}

interface SpeechControllerOptions {
  engine?: () => SpeechEngine | undefined;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
}

const EMPTY_SNAPSHOT: SpeechSnapshot = { status: "idle", text: "", language: "" };

export function normalizeSpeechLanguage(language?: string): string {
  const normalized = language?.trim().replace("_", "-").toLowerCase() ?? "";
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized === "en-gb") return "en-GB";
  if (normalized.startsWith("en")) return "en-US";
  if (normalized.startsWith("ja")) return "ja-JP";
  if (normalized.startsWith("ko")) return "ko-KR";
  return language?.trim() || "en-US";
}

/** Split long text at natural boundaries because Windows voices can stall on one large utterance. */
export function splitSpeechText(text: string, maxLength = 220): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const parts = normalized.split(/(?<=[。！？!?；;:.])\s*|\n+/u).filter(Boolean);
  const chunks: string[] = [];
  for (const part of parts) {
    let remaining = part.trim();
    while (remaining.length > maxLength) {
      const window = remaining.slice(0, maxLength + 1);
      const boundary = Math.max(window.lastIndexOf(" "), window.lastIndexOf("，"), window.lastIndexOf(","));
      const end = boundary >= Math.floor(maxLength * 0.55) ? boundary : maxLength;
      chunks.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trim();
    }
    if (remaining) chunks.push(remaining);
  }
  return chunks;
}

export function pickSpeechVoice(voices: SpeechSynthesisVoice[], language: string): SpeechSynthesisVoice | undefined {
  const wanted = normalizeSpeechLanguage(language).toLowerCase();
  const exact = voices.find((voice) => voice.lang.toLowerCase() === wanted);
  if (exact) return exact;
  const prefix = wanted.split("-")[0];
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(`${prefix}-`));
}

export class SpeechController {
  private snapshot: SpeechSnapshot = { ...EMPTY_SNAPSHOT };
  private readonly listeners = new Set<(snapshot: SpeechSnapshot) => void>();
  private queue: string[] = [];
  private generation = 0;

  constructor(private readonly options: SpeechControllerOptions = {}) {
    this.engine()?.addEventListener?.("voiceschanged", () => this.emit());
  }

  private engine(): SpeechEngine | undefined {
    if (this.options.engine) return this.options.engine();
    return typeof window === "undefined" ? undefined : window.speechSynthesis;
  }

  private createUtterance(text: string): SpeechSynthesisUtterance {
    if (this.options.createUtterance) return this.options.createUtterance(text);
    return new SpeechSynthesisUtterance(text);
  }

  getSnapshot(): SpeechSnapshot {
    return { ...this.snapshot };
  }

  subscribe(listener: (snapshot: SpeechSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  canSpeak(language?: string): boolean {
    const engine = this.engine();
    if (!engine) return false;
    const voices = engine.getVoices();
    return !voices.length || Boolean(pickSpeechVoice(voices, language || "en-US"));
  }

  speak(text: string, language?: string, owner?: symbol): boolean {
    const content = text.trim();
    const lang = normalizeSpeechLanguage(language);
    const engine = this.engine();
    if (!engine || !content || !this.canSpeak(lang)) {
      this.snapshot = {
        status: "unavailable",
        text: content,
        language: lang,
        owner,
        error: "当前系统未安装匹配的语音。"
      };
      this.emit();
      return false;
    }
    this.stop();
    this.queue = splitSpeechText(content);
    this.snapshot = { status: "speaking", text: content, language: lang, owner };
    this.emit();
    this.speakNext(++this.generation);
    return true;
  }

  toggle(text: string, language?: string, owner?: symbol): boolean {
    if (this.snapshot.status === "speaking" && this.snapshot.owner === owner) {
      this.stop(owner);
      return false;
    }
    return this.speak(text, language, owner);
  }

  stop(owner?: symbol): void {
    if (owner && this.snapshot.owner !== owner) return;
    this.generation += 1;
    this.queue = [];
    this.engine()?.cancel();
    this.snapshot = { ...EMPTY_SNAPSHOT };
    this.emit();
  }

  private speakNext(generation: number): void {
    if (generation !== this.generation || this.snapshot.status !== "speaking") return;
    const next = this.queue.shift();
    if (!next) {
      this.snapshot = { ...EMPTY_SNAPSHOT };
      this.emit();
      return;
    }
    const engine = this.engine();
    if (!engine) {
      this.snapshot = { ...this.snapshot, status: "unavailable", error: "系统语音服务不可用。" };
      this.emit();
      return;
    }
    const utterance = this.createUtterance(next);
    utterance.lang = this.snapshot.language;
    const voice = pickSpeechVoice(engine.getVoices(), this.snapshot.language);
    if (voice) utterance.voice = voice;
    utterance.onend = () => this.speakNext(generation);
    utterance.onerror = () => {
      if (generation !== this.generation) return;
      this.queue = [];
      this.snapshot = { ...this.snapshot, status: "error", error: "朗读失败，请检查系统语音设置。" };
      this.emit();
    };
    engine.speak(utterance);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const speechController = new SpeechController();

