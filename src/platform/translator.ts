import type { TranslatorApi } from "../../electron/shared/api";
import { DEFAULT_SETTINGS } from "../../electron/shared/defaults";
import type { TranslationEvent, TranslationHistory } from "../../electron/shared/types";

export function getTranslatorApi(): TranslatorApi {
  if (!window.translator) {
    throw new Error("LexiFlow preload API is unavailable.");
  }
  return window.translator;
}

export function hasTranslatorApi(): boolean {
  return Boolean(window.translator);
}

export function installBrowserPreviewApi(): void {
  if (window.translator || navigator.userAgent.includes("Electron")) return;

  let settings = structuredClone(DEFAULT_SETTINGS);
  const listeners = new Set<(event: TranslationEvent) => void>();
  const history: TranslationHistory[] = [
    {
      id: "preview-history",
      sourceText: "Keep the implementation small and observable.",
      resultText: "让实现保持精简，并且便于观察运行状态。",
      mode: "technical",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "ollama",
      model: "qwen3:4b",
      createdAt: new Date().toISOString()
    }
  ];

  // Browser preview mode is deliberately separate from Electron. It supports
  // visual review without masking a missing preload inside the real app.
  window.translator = {
    runtime: {
      ping: async () => ({ apiVersion: 1, electron: "browser-preview", platform: "browser" })
    },
    settings: {
      get: async () => structuredClone(settings),
      update: async (next) => {
        settings = structuredClone(next);
        return {
          settings: structuredClone(settings),
          shortcutResult: { translation: true, naming: true, errors: [] }
        };
      }
    },
    provider: {
      healthCheck: async () => ({ ok: true, message: "浏览器预览模式：界面连接正常。" }),
      getModels: async () => [{ id: "qwen3:4b", name: "qwen3:4b" }]
    },
    translation: {
      start: async (request) => {
        const requestId = crypto.randomUUID();
        queueMicrotask(() => listeners.forEach((listener) => listener({ requestId, status: "loading" })));
        setTimeout(() => {
          const content = request.mode === "naming"
            ? JSON.stringify({
                recommended: "isContentReady",
                candidates: [
                  { name: "isContentReady", meaning: "内容是否已准备完成" },
                  { name: "hasContentLoaded", meaning: "内容是否已经加载" }
                ]
              })
            : "这是一段用于界面预览的流式结果。真实翻译只会在 Electron 中调用所选模型。";
          listeners.forEach((listener) => listener({ requestId, status: "success", content }));
        }, 450);
        return requestId;
      },
      cancel: () => undefined,
      onEvent: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    },
    selection: {
      capture: async () => ({ text: "" })
    },
    history: {
      list: async () => structuredClone(history),
      delete: async (id) => {
        const index = history.findIndex((item) => item.id === id);
        if (index >= 0) history.splice(index, 1);
      },
      clear: async () => {
        history.splice(0);
      }
    },
    clipboard: {
      writeText: async (text) => navigator.clipboard?.writeText(text)
    },
    window: {
      openMain: () => undefined,
      closePopup: () => undefined,
      pinPopup: () => undefined,
      onPopupPayload: () => () => undefined,
      onNavigate: () => () => undefined
    }
  };
}
