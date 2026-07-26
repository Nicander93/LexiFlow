import { randomUUID } from "node:crypto";
import type { SegmentAlternative } from "../../shared/types";
import { validateAlternativesResponse } from "../core/structured";

export function parseSegmentAlternatives(content: string): SegmentAlternative[] | null {
  const parsed = validateAlternativesResponse(content, () => randomUUID());
  return parsed.ok ? parsed.alternatives : null;
}
