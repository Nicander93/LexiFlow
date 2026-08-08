import { describe, expect, it } from "vitest";
import { reduceTranslationState } from "../electron/shared/translation-state";
import type { TranslationState } from "../electron/shared/types";

describe("共享翻译状态 reducer", () => {
  it("在主进程与 Renderer 之间保持句段和 warning 规则一致", () => {
    const initial: TranslationState = { status: "loading", content: "" };
    const loading = reduceTranslationState(initial, { requestId: "r1", status: "loading" });
    const streaming = reduceTranslationState(loading, {
      requestId: "r1",
      status: "streaming",
      segment: { id: "s1", source: "Hello", target: "你好", sourceStart: 0, sourceEnd: 5 }
    });
    const success = reduceTranslationState(streaming, { requestId: "r1", status: "success", content: "你好", warning: "历史写入失败" });
    expect(success.content).toBe("你好");
    expect(success.result?.segments[0]?.target).toBe("你好");
    expect(success.warning).toBe("历史写入失败");
    expect(success.status).toBe("success");
  });

  it("忽略旧 requestId 的迟到事件", () => {
    const state: TranslationState = { requestId: "new", status: "streaming", content: "new" };
    expect(reduceTranslationState(state, { requestId: "old", status: "success", content: "old" })).toBe(state);
  });
});

