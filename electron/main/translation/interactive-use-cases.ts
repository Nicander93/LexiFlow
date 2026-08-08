import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { mapProviderError } from "../core/errors";
import { resolveModelAccess } from "../core/model-access-gate";
import { modelTaskScheduler } from "../core/model-task-scheduler";
import {
  buildStructuredRepairPrompt,
  recordStructuredParseFailure,
  validateAlternativesResponse,
  type StructuredKind
} from "../core/structured";
import { validateInput } from "../core/validation";
import { resolveTranslationPolicy } from "../core/translation-policy";
import type { SettingsStore } from "../storage/settings";
import type { ProfileStore } from "../storage/profiles";
import type { InteractiveModelGatewayFactory } from "../domain/translation/ports";
import type {
  DictionaryContextEvent,
  DictionaryContextRequest,
  SegmentAlternative,
  SegmentAlternativeEvent,
  SegmentAlternativeRequest,
  SegmentRevisionEvent,
  SegmentRevisionRequest
} from "../../shared/types";
import type { RequestCoordinator } from "./request-coordinator";

async function collectStream(stream: AsyncIterable<{ content: string }>): Promise<string> {
  let content = "";
  for await (const chunk of stream) content += chunk.content;
  return content;
}

interface Emitters {
  revision(sender: WebContents, event: SegmentRevisionEvent): void;
  alternatives(sender: WebContents, event: SegmentAlternativeEvent): void;
  dictionary(sender: WebContents, event: DictionaryContextEvent): void;
}

export class InteractiveTranslationUseCases {
  private readonly alternativesCache = new Map<string, SegmentAlternative[]>();

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly profileStore: ProfileStore,
    private readonly createGateway: InteractiveModelGatewayFactory,
    private readonly coordinator: RequestCoordinator,
    private readonly emitters: Emitters
  ) {}

  private end(requestId: string): void { this.coordinator.end(requestId); }
  private isActive(requestId: string): boolean { return this.coordinator.isActive(requestId); }

  private async repairOnce(kind: StructuredKind, raw: string, settings: ReturnType<SettingsStore["get"]>, signal: AbortSignal): Promise<string> {
    const prompt = buildStructuredRepairPrompt(kind, raw);
    return collectStream(this.createGateway(settings).chat([{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }], signal));
  }

  private async runModelInteractive<T>(signal: AbortSignal, work: (slotSignal: AbortSignal) => Promise<T>): Promise<T> {
    return modelTaskScheduler.runInteractive(async ({ signal: slotSignal }) => work(slotSignal), signal);
  }

  private applyEnhancementPolicy<T extends { profileId?: string; profilePrompt?: string; targetLanguage: import("../../shared/types").TargetLanguage }>(request: T): { request: T; profile: ReturnType<ProfileStore["get"]>; settings: ReturnType<SettingsStore["get"]> } {
    const settings = this.settingsStore.get();
    const profile = this.profileStore.get(request.profileId);
    const policy = resolveTranslationPolicy(settings, profile, { mode: "normal", targetLanguage: request.targetLanguage, profileId: request.profileId });
    return { settings, profile, request: { ...request, profileId: policy.profileId, profilePrompt: policy.systemPrompt, targetLanguage: policy.targetLanguage } };
  }

  async runDictionaryContext(sender: WebContents, requestId: string, request: DictionaryContextRequest, signal: AbortSignal): Promise<void> {
    if (!request.term.trim() || !request.source.trim() || !request.target.trim()) {
      this.emitters.dictionary(sender, { requestId, status: "error", error: "词典上下文不完整。" });
      this.end(requestId);
      return;
    }
    const resolved = this.applyEnhancementPolicy(request);
    request = resolved.request;
    const access = resolveModelAccess(resolved.settings, { profile: resolved.profile, task: "dictionary", textLength: request.source.length });
    if (!access.ok) {
      this.emitters.dictionary(sender, { requestId, status: "error", error: access.error });
      this.end(requestId);
      return;
    }
    this.emitters.dictionary(sender, { requestId, status: "loading" });
    try {
      const explanation = (await this.runModelInteractive(signal, (slotSignal) => collectStream(this.createGateway(access.settings).explainDictionary(request, slotSignal)))).trim();
      if (!explanation) throw new Error("模型返回空内容。 ");
      if (!this.isActive(requestId)) return;
      this.emitters.dictionary(sender, { requestId, status: "success", explanation });
    } catch (error) {
      this.emitters.dictionary(sender, { requestId, status: signal.aborted ? "cancelled" : "error", error: signal.aborted ? "请求已取消。" : mapProviderError(error) });
    } finally {
      this.end(requestId);
    }
  }

  async runAlternatives(sender: WebContents, requestId: string, request: SegmentAlternativeRequest, signal: AbortSignal): Promise<void> {
    const cacheKey = `${request.targetLanguage}\u0000${request.segment.source}\u0000${request.segment.target}`;
    const cached = this.alternativesCache.get(cacheKey);
    if (cached) {
      this.emitters.alternatives(sender, { requestId, status: "success", alternatives: structuredClone(cached) });
      this.end(requestId);
      return;
    }
    const resolved = this.applyEnhancementPolicy(request);
    request = resolved.request;
    const access = resolveModelAccess(resolved.settings, { profile: resolved.profile, task: "alternatives", textLength: request.segment.source.length });
    if (!access.ok) {
      this.emitters.alternatives(sender, { requestId, status: "error", error: access.error });
      this.end(requestId);
      return;
    }
    this.emitters.alternatives(sender, { requestId, status: "loading" });
    try {
      const alternatives = await this.runModelInteractive(signal, async (slotSignal) => {
        let content = await collectStream(this.createGateway(access.settings).alternatives(request, slotSignal));
        let parsed = validateAlternativesResponse(content, () => randomUUID());
        if (!parsed.ok) {
          recordStructuredParseFailure("alternatives", parsed.reason);
          content = await this.repairOnce("alternatives", content, access.settings, slotSignal);
          parsed = validateAlternativesResponse(content, () => randomUUID());
          if (!parsed.ok) {
            recordStructuredParseFailure("alternatives", parsed.reason);
            throw new Error("候选译法格式无效。 ");
          }
        }
        return parsed.alternatives;
      });
      this.alternativesCache.set(cacheKey, alternatives);
      if (this.alternativesCache.size > 50) this.alternativesCache.delete(this.alternativesCache.keys().next().value!);
      this.emitters.alternatives(sender, { requestId, status: "success", alternatives });
    } catch (error) {
      this.emitters.alternatives(sender, { requestId, status: signal.aborted ? "cancelled" : "error", error: signal.aborted ? "请求已取消。" : mapProviderError(error) });
    } finally {
      this.end(requestId);
    }
  }

  async runRevision(sender: WebContents, requestId: string, request: SegmentRevisionRequest, signal: AbortSignal): Promise<void> {
    const source = validateInput(request.segment.source, this.settingsStore.get().translation.maxInputLength);
    if (!source.ok || !request.instruction.trim()) {
      this.emitters.revision(sender, { requestId, status: "error", error: source.ok ? "重译要求不能为空。" : source.message });
      this.end(requestId);
      return;
    }
    const resolved = this.applyEnhancementPolicy(request);
    request = resolved.request;
    const access = resolveModelAccess(resolved.settings, { profile: resolved.profile, task: "revision", textLength: request.segment.source.length });
    if (!access.ok) {
      this.emitters.revision(sender, { requestId, status: "error", error: access.error });
      this.end(requestId);
      return;
    }
    this.emitters.revision(sender, { requestId, status: "loading" });
    try {
      const newTarget = (await this.runModelInteractive(signal, (slotSignal) => collectStream(this.createGateway(access.settings).revise(request, slotSignal)))).trim();
      if (!newTarget) throw new Error("模型返回空内容。 ");
      if (!this.isActive(requestId)) return;
      this.emitters.revision(sender, { requestId, status: "success", revision: { id: randomUUID(), segmentId: request.segment.id, previousTarget: request.segment.target, newTarget, instruction: request.instruction.trim(), createdAt: Date.now() } });
    } catch (error) {
      this.emitters.revision(sender, { requestId, status: signal.aborted ? "cancelled" : "error", error: signal.aborted ? "请求已取消。" : mapProviderError(error) });
    } finally {
      this.end(requestId);
    }
  }
}
