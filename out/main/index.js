import { clipboard, globalShortcut, ipcMain, app, safeStorage, nativeImage, Tray, Menu, BrowserWindow, screen } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
function validateInput(text, maxLength) {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return { ok: false, message: "请输入文本，或先在其他应用中选中文字。" };
  if (normalized.length > maxLength) {
    return { ok: false, message: `文本长度超过 ${maxLength} 个字符，请缩短后重试。` };
  }
  return { ok: true, text: normalized };
}
function hasClipboardChanged(_before, after, marker) {
  return after !== marker && after.trim().length > 0;
}
const execFileAsync = promisify(execFile);
const COPY_COMMAND = "$ws = New-Object -ComObject WScript.Shell; $ws.SendKeys('^c')";
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
function snapshotClipboard() {
  return {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
    image: clipboard.readImage()
  };
}
function restoreClipboard(snapshot) {
  clipboard.write({
    text: snapshot.text,
    html: snapshot.html || void 0,
    rtf: snapshot.rtf || void 0,
    image: snapshot.image.isEmpty() ? void 0 : snapshot.image
  });
}
async function captureSelectedText(maxLength) {
  if (process.platform !== "win32") {
    return { text: "", error: "划词获取仅支持 Windows，请在输入框中粘贴文本。" };
  }
  const snapshot = snapshotClipboard();
  const marker = `__LEXIFLOW_${randomUUID()}__`;
  try {
    clipboard.writeText(marker);
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", COPY_COMMAND], {
      windowsHide: true,
      timeout: 2e3
    });
    let selectedText = marker;
    for (let attempt = 0; attempt < 8 && selectedText === marker; attempt += 1) {
      await wait(40);
      selectedText = clipboard.readText();
    }
    if (!hasClipboardChanged(snapshot.text, selectedText, marker)) {
      return { text: "", error: "未检测到选中文字，请重新选择或手动输入。" };
    }
    if (selectedText.length > maxLength) {
      return { text: "", error: `选中文字超过 ${maxLength} 个字符，请缩短后重试。` };
    }
    return { text: selectedText };
  } catch {
    return { text: "", error: "读取选中文字失败，请改用手动输入。" };
  } finally {
    await wait(40);
    restoreClipboard(snapshot);
  }
}
class HotkeyManager {
  constructor(onTrigger) {
    this.onTrigger = onTrigger;
  }
  lastTriggeredAt = 0;
  register(settings) {
    globalShortcut.unregisterAll();
    if (settings.paused) return { translation: true, naming: true, errors: [] };
    const trigger = (mode) => {
      const now = Date.now();
      if (now - this.lastTriggeredAt < 350) return;
      this.lastTriggeredAt = now;
      this.onTrigger(mode);
    };
    const translation = globalShortcut.register(settings.translation, () => trigger("technical"));
    const naming = globalShortcut.register(settings.naming, () => trigger("naming"));
    const errors = [];
    if (!translation) errors.push(`快捷键 ${settings.translation} 注册失败，可能已被其他程序占用。`);
    if (!naming) errors.push(`快捷键 ${settings.naming} 注册失败，可能已被其他程序占用。`);
    return { translation, naming, errors };
  }
  unregister() {
    globalShortcut.unregisterAll();
  }
}
function validateSettings(settings) {
  const errors = [];
  try {
    const url = new URL(settings.provider.baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) errors.push("模型服务地址必须使用 HTTP 或 HTTPS。 ");
  } catch {
    errors.push("模型服务地址格式不正确。 ");
  }
  if (!settings.provider.model.trim()) errors.push("模型名称不能为空。 ");
  if (settings.provider.timeoutMs < 1e3) errors.push("请求超时时间不能小于 1000 毫秒。 ");
  if (!settings.shortcuts.translation.trim() || !settings.shortcuts.naming.trim()) errors.push("快捷键不能为空。 ");
  if (settings.shortcuts.translation === settings.shortcuts.naming) errors.push("翻译和命名不能使用相同快捷键。 ");
  if (settings.translation.maxInputLength < 100) errors.push("最大输入长度不能小于 100。 ");
  if (settings.history.maxItems < 1) errors.push("历史记录数量不能小于 1。 ");
  return errors;
}
function detectLanguage(text) {
  const chineseCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const englishCount = (text.match(/[A-Za-z]/g) ?? []).length;
  return chineseCount >= englishCount * 0.35 ? "zh-CN" : "en";
}
function resolveTargetLanguage(text, target) {
  if (target !== "auto") return target;
  return detectLanguage(text) === "zh-CN" ? "en" : "zh-CN";
}
const LANGUAGE_LABELS = { "zh-CN": "简体中文", en: "英文" };
function buildPrompt(request, settings) {
  const targetLanguage = resolveTargetLanguage(request.text, request.targetLanguage);
  if (request.mode === "naming") {
    const options = request.namingOptions;
    if (!options) throw new Error("编程命名参数不完整。 ");
    return {
      system: settings.translation.namingPrompt,
      user: `语义：${request.text}
命名类型：${options.type}
命名风格：${options.style}
编程语言：${options.language}`,
      targetLanguage
    };
  }
  const system = request.mode === "technical" ? settings.translation.technicalPrompt : settings.translation.normalPrompt;
  return {
    system,
    user: `目标语言：${LANGUAGE_LABELS[targetLanguage]}

${request.text}`,
    targetLanguage
  };
}
function buildModelOptions(inputLength) {
  return {
    temperature: 0.1,
    topP: 0.8,
    maxTokens: Math.min(8192, Math.max(512, Math.ceil(inputLength * 1.6)))
  };
}
class UserFacingError extends Error {
}
function mapProviderError(error) {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "请求已取消。";
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out/i.test(message)) return "模型请求超时，请检查服务状态或增大超时时间。";
  if (/401|unauthorized|invalid.*key/i.test(message)) return "API Key 无效，请在设置中检查后重试。";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) return "无法连接到模型服务，请确认服务已启动且地址正确。";
  if (/model.*not found|404/i.test(message)) return "未找到配置的模型，请在设置中选择或填写可用模型。";
  return "翻译请求失败，请检查模型服务设置后重试。";
}
function createRequestSignal(timeoutMs, signal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}
async function ensureResponse(response) {
  if (response.ok) return response;
  const text = await response.text();
  let detail = text;
  try {
    const json = JSON.parse(text);
    detail = typeof json.error === "string" ? json.error : json.error?.message ?? json.message ?? text;
  } catch {
  }
  throw new UserFacingError(detail || `模型服务返回 HTTP ${response.status}。`);
}
function normalizeBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, "");
}
function parseOllamaLine(line) {
  if (!line.trim()) return null;
  const item = JSON.parse(line);
  if (item.error) throw new Error(item.error);
  return { content: item.message?.content ?? "", done: Boolean(item.done) };
}
function parseOpenAIEvent(event) {
  const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  if (!data) return null;
  if (data.trim() === "[DONE]") return { content: "", done: true };
  const item = JSON.parse(data);
  if (item.error?.message) throw new Error(item.error.message);
  const choice = item.choices?.[0];
  return {
    content: choice?.delta?.content ?? "",
    done: Boolean(choice?.finish_reason)
  };
}
async function* readDelimitedStream(body, delimiter, parse) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parts = buffer.split(delimiter);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const parsed = parse(part);
        if (parsed !== null) yield parsed;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const parsed = parse(buffer);
      if (parsed !== null) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}
class OllamaProvider {
  constructor(config, settings) {
    this.config = config;
    this.settings = settings;
  }
  async healthCheck(signal) {
    try {
      const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/tags`, {
        signal: createRequestSignal(Math.min(this.config.timeoutMs, 5e3), signal)
      });
      await ensureResponse(response);
      return { ok: true, message: "Ollama 服务连接正常。" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Ollama 服务不可用。" };
    }
  }
  async getModels(signal) {
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/tags`, {
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    const payload = await response.json();
    return (payload.models ?? []).map((model) => ({ id: model.name, name: model.name }));
  }
  async *translate(request, signal) {
    const prompt = buildPrompt(request, this.settings);
    const options = buildModelOptions(request.text.length);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        stream: true,
        keep_alive: this.config.keepAlive,
        think: false,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ],
        options: {
          temperature: options.temperature,
          top_p: options.topP,
          num_predict: options.maxTokens
        }
      }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n", parseOllamaLine);
  }
}
class OpenAICompatibleProvider {
  constructor(config, settings) {
    this.config = config;
    this.settings = settings;
  }
  headers() {
    if (!this.config.apiKey) throw new UserFacingError("请先在设置中填写 API Key。 ");
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` };
  }
  async healthCheck(signal) {
    try {
      await this.getModels(signal);
      return { ok: true, message: "OpenAI-compatible 服务连接正常。" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "模型服务不可用。" };
    }
  }
  async getModels(signal) {
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/models`, {
      headers: this.headers(),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    const payload = await response.json();
    return (payload.data ?? []).map((model) => ({ id: model.id, name: model.id }));
  }
  async *translate(request, signal) {
    const prompt = buildPrompt(request, this.settings);
    const options = buildModelOptions(request.text.length);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.model,
        stream: true,
        temperature: options.temperature,
        top_p: options.topP,
        max_tokens: options.maxTokens,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ]
      }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n\n", parseOpenAIEvent);
  }
}
function createProvider(settings) {
  return settings.provider.type === "ollama" ? new OllamaProvider(settings.provider, settings) : new OpenAICompatibleProvider(settings.provider, settings);
}
const IPC_CHANNELS = {
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  providerHealth: "provider:health",
  providerModels: "provider:models",
  translationStart: "translation:start",
  translationCancel: "translation:cancel",
  translationEvent: "translation:event",
  selectionCapture: "selection:capture",
  historyList: "history:list",
  historyDelete: "history:delete",
  historyClear: "history:clear",
  clipboardWrite: "clipboard:write",
  windowOpenMain: "window:open-main",
  popupPayload: "popup:payload",
  popupClose: "popup:close",
  popupPin: "popup:pin"
};
function registerIpcHandlers(dependencies) {
  const { settingsStore, historyStore, translationManager, windowManager } = dependencies;
  ipcMain.handle(IPC_CHANNELS.settingsGet, () => settingsStore.getPublic());
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (_event, settings) => {
    const errors = validateSettings(settings);
    if (errors.length) throw new Error(errors.join("\n"));
    const updated = await settingsStore.update(settings);
    return { settings: updated, shortcutResult: dependencies.applySettings(settingsStore.get()) };
  });
  ipcMain.handle(IPC_CHANNELS.providerHealth, async () => {
    return createProvider(settingsStore.get()).healthCheck();
  });
  ipcMain.handle(IPC_CHANNELS.providerModels, async () => {
    return createProvider(settingsStore.get()).getModels();
  });
  ipcMain.handle(IPC_CHANNELS.translationStart, (event, request) => {
    return translationManager.start(event.sender, request);
  });
  ipcMain.on(IPC_CHANNELS.translationCancel, (_event, requestId) => {
    translationManager.cancel(requestId);
  });
  ipcMain.handle(IPC_CHANNELS.selectionCapture, () => {
    return captureSelectedText(settingsStore.get().translation.maxInputLength);
  });
  ipcMain.handle(IPC_CHANNELS.historyList, () => historyStore.list());
  ipcMain.handle(IPC_CHANNELS.historyDelete, (_event, id) => historyStore.delete(id));
  ipcMain.handle(IPC_CHANNELS.historyClear, () => historyStore.clear());
  ipcMain.handle(IPC_CHANNELS.clipboardWrite, (_event, text) => clipboard.writeText(text));
  ipcMain.on(IPC_CHANNELS.windowOpenMain, (_event, route) => {
    void windowManager.showMainWindow(route);
  });
  ipcMain.on(IPC_CHANNELS.popupClose, () => {
    translationManager.cancel();
    windowManager.hidePopup();
  });
  ipcMain.on(IPC_CHANNELS.popupPin, (_event, pinned) => {
    windowManager.setPopupPinned(pinned);
  });
  app.on("before-quit", () => translationManager.cancel());
}
class JsonStore {
  constructor(filePath, fallback) {
    this.filePath = filePath;
    this.fallback = fallback;
  }
  async read() {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8"));
    } catch {
      return structuredClone(this.fallback);
    }
  }
  async write(value) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
    await rename(temporaryPath, this.filePath);
  }
}
class HistoryStore {
  store;
  items = [];
  async initialize() {
    this.store = new JsonStore(join(app.getPath("userData"), "history.json"), []);
    this.items = await this.store.read();
  }
  list() {
    return structuredClone(this.items);
  }
  async add(item, settings) {
    if (!settings.enabled) return;
    this.items = [item, ...this.items].slice(0, settings.maxItems);
    await this.store.write(this.items);
  }
  async delete(id) {
    this.items = this.items.filter((item) => item.id !== id);
    await this.store.write(this.items);
  }
  async clear() {
    this.items = [];
    await this.store.write(this.items);
  }
}
const DEFAULT_PROMPTS = {
  normal: `你是一个专业翻译工具。请将输入内容翻译为目标语言。
要求：
1. 忠实保留原意，不总结、不解释、不增加信息。
2. 保留段落和换行。
3. 除译文外不要输出任何内容。`,
  technical: `你是一个面向软件开发和技术文档的专业翻译工具。
要求：
1. 忠实翻译，不总结、不解释。
2. 保留代码、变量名、方法名、类名、接口名。
3. 保留 URL、文件路径、命令、配置项和日志。
4. 保留 Markdown 和代码块格式。
5. 对技术术语使用准确、常见的表达；不确定的专有名词保留英文。
6. 除译文外不要输出其他内容。`,
  naming: `你是一个专业的软件工程命名助手。根据用户输入的中文语义，生成符合指定编程语言、命名类型和命名风格的英文名称。
要求：
1. 语义准确，避免拼音和无意义缩写。
2. 布尔变量使用合适的 is、has、can、should、exists、enabled 前缀。
3. 方法名使用动词开头，类名使用名词，不使用语言保留字。
4. 仅返回合法 JSON，不使用 Markdown 代码块。
5. JSON 格式为 {"recommended":"name","candidates":[{"name":"name","meaning":"中文含义"}]}。`
};
const DEFAULT_SETTINGS = {
  provider: {
    type: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen3:4b",
    timeoutMs: 6e4,
    stream: true,
    keepAlive: "5m"
  },
  shortcuts: {
    translation: "Alt+Space",
    naming: "Alt+Shift+Space",
    paused: false
  },
  translation: {
    targetLanguage: "auto",
    maxInputLength: 1e4,
    normalPrompt: DEFAULT_PROMPTS.normal,
    technicalPrompt: DEFAULT_PROMPTS.technical,
    namingPrompt: DEFAULT_PROMPTS.naming
  },
  history: {
    enabled: true,
    maxItems: 100
  },
  window: {
    closeAction: "hide",
    autoHidePopup: true
  },
  startup: {
    enabled: false
  }
};
const MASKED_KEY = "••••••••";
function mergeSettings(value) {
  return {
    provider: { ...DEFAULT_SETTINGS.provider, ...value?.provider, apiKey: void 0 },
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...value?.shortcuts },
    translation: { ...DEFAULT_SETTINGS.translation, ...value?.translation },
    history: { ...DEFAULT_SETTINGS.history, ...value?.history },
    window: { ...DEFAULT_SETTINGS.window, ...value?.window },
    startup: { ...DEFAULT_SETTINGS.startup, ...value?.startup }
  };
}
class SettingsStore {
  store;
  value;
  volatileApiKey = "";
  async initialize() {
    const fallback = mergeSettings();
    this.store = new JsonStore(join(app.getPath("userData"), "settings.json"), fallback);
    this.value = mergeSettings(await this.store.read());
  }
  decryptApiKey() {
    if (!this.value.provider.encryptedApiKey) return this.volatileApiKey;
    try {
      return safeStorage.decryptString(Buffer.from(this.value.provider.encryptedApiKey, "base64"));
    } catch {
      return this.volatileApiKey;
    }
  }
  get() {
    return {
      ...structuredClone(this.value),
      provider: { ...this.value.provider, apiKey: this.decryptApiKey(), encryptedApiKey: void 0 }
    };
  }
  getPublic() {
    const settings = this.get();
    settings.provider.apiKey = settings.provider.apiKey ? MASKED_KEY : "";
    return settings;
  }
  async update(next) {
    const currentApiKey = this.decryptApiKey();
    const requestedApiKey = next.provider.apiKey === MASKED_KEY ? currentApiKey : next.provider.apiKey ?? "";
    const stored = mergeSettings(next);
    delete stored.provider.apiKey;
    delete stored.provider.encryptedApiKey;
    if (requestedApiKey) {
      if (safeStorage.isEncryptionAvailable()) {
        stored.provider.encryptedApiKey = safeStorage.encryptString(requestedApiKey).toString("base64");
      } else {
        this.volatileApiKey = requestedApiKey;
      }
    } else {
      this.volatileApiKey = "";
    }
    this.value = stored;
    await this.store.write(stored);
    return this.getPublic();
  }
}
function parseNamingResult(content) {
  const jsonText = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value;
  try {
    value = JSON.parse(jsonText);
  } catch {
    throw new Error("模型返回的命名结果格式不正确，请重试。 ");
  }
  if (!value || typeof value !== "object") throw new Error("模型未返回有效的命名结果。 ");
  const result = value;
  if (typeof result.recommended !== "string" || !Array.isArray(result.candidates)) {
    throw new Error("模型返回的命名结果缺少必要字段。 ");
  }
  const candidates = result.candidates.filter(
    (candidate) => candidate && typeof candidate.name === "string" && typeof candidate.meaning === "string"
  );
  if (!candidates.length) throw new Error("模型没有返回可用的候选名称。 ");
  return { recommended: result.recommended, candidates };
}
class TranslationManager {
  constructor(settingsStore, historyStore) {
    this.settingsStore = settingsStore;
    this.historyStore = historyStore;
  }
  activeRequest = null;
  emit(sender, event) {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.translationEvent, event);
  }
  start(sender, request) {
    this.cancel();
    const id = randomUUID();
    const controller = new AbortController();
    this.activeRequest = { id, controller };
    void this.run(sender, id, request, controller.signal);
    return id;
  }
  async run(sender, requestId, request, signal) {
    const settings = this.settingsStore.get();
    const validation = validateInput(request.text, settings.translation.maxInputLength);
    if (!validation.ok) {
      this.emit(sender, { requestId, status: "error", error: validation.message });
      return;
    }
    request = { ...request, text: validation.text };
    this.emit(sender, { requestId, status: "loading" });
    let resultText = "";
    try {
      const provider = createProvider(settings);
      for await (const chunk of provider.translate(request, signal)) {
        if (this.activeRequest?.id !== requestId) return;
        if (chunk.content) {
          resultText += chunk.content;
          this.emit(sender, { requestId, status: "streaming", content: chunk.content });
        }
      }
      if (!resultText.trim()) throw new Error("模型返回空内容。 ");
      if (request.mode === "naming") {
        resultText = JSON.stringify(parseNamingResult(resultText));
      }
      if (this.activeRequest?.id !== requestId) return;
      this.emit(sender, { requestId, status: "success", content: resultText });
      await this.historyStore.add(
        {
          id: randomUUID(),
          sourceText: request.text,
          resultText,
          mode: request.mode,
          sourceLanguage: detectLanguage(request.text),
          targetLanguage: resolveTargetLanguage(request.text, request.targetLanguage),
          provider: settings.provider.type,
          model: settings.provider.model,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        settings.history
      );
    } catch (error) {
      if (signal.aborted) {
        this.emit(sender, { requestId, status: "cancelled", error: "请求已取消。" });
      } else {
        console.error("Translation request failed", error instanceof Error ? error.message : error);
        this.emit(sender, { requestId, status: "error", error: mapProviderError(error) });
      }
    } finally {
      if (this.activeRequest?.id === requestId) this.activeRequest = null;
    }
  }
  cancel(requestId) {
    if (!this.activeRequest) return;
    if (requestId && this.activeRequest.id !== requestId) return;
    this.activeRequest.controller.abort();
    this.activeRequest = null;
  }
}
const TRAY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAWUlEQVR42mNgQAX/Gf4z/Gf4zwAEdCUDCYZ/DP8Z/jP8Z/jP8J/hP8N/hv8M/xn+M/xn+A8UQjDMYHgAxTCA4T8jAwPDfyYGBgaG/wwMDAwM/xkYGBj+MwAA1QwfcaafvxUAAAAASUVORK5CYII=";
class TrayManager {
  constructor(actions) {
    this.actions = actions;
  }
  tray = null;
  create(shortcuts) {
    if (!this.tray) {
      const icon = nativeImage.createFromDataURL(TRAY_ICON);
      this.tray = new Tray(icon);
      this.tray.setToolTip("LexiFlow 桌面翻译");
      this.tray.on("double-click", this.actions.openMain);
    }
    this.update(shortcuts);
  }
  update(shortcuts) {
    if (!this.tray) return;
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: "打开主窗口", click: this.actions.openMain },
      { type: "separator" },
      { label: "快速翻译", accelerator: shortcuts.translation, click: this.actions.quickTranslate },
      { label: "编程命名", accelerator: shortcuts.naming, click: this.actions.naming },
      { label: "设置", click: this.actions.openSettings },
      { type: "separator" },
      {
        label: "暂停全局快捷键",
        type: "checkbox",
        checked: shortcuts.paused,
        click: (item) => this.actions.togglePaused(item.checked)
      },
      { type: "separator" },
      { label: "退出", click: this.actions.quit }
    ]));
  }
  destroy() {
    this.tray?.destroy();
    this.tray = null;
  }
}
class WindowManager {
  constructor(getCloseAction, shouldAutoHidePopup) {
    this.getCloseAction = getCloseAction;
    this.shouldAutoHidePopup = shouldAutoHidePopup;
  }
  mainWindow = null;
  popupWindow = null;
  popupPinned = false;
  isQuitting = false;
  setQuitting(value) {
    this.isQuitting = value;
  }
  createWindow(options) {
    return new BrowserWindow({
      ...options,
      webPreferences: {
        preload: join(__dirname, "../preload/index.mjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
  }
  async loadRenderer(window, route = "/") {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (rendererUrl) {
      await window.loadURL(`${rendererUrl}#${route}`);
    } else {
      await window.loadFile(join(__dirname, "../../dist/index.html"), { hash: route });
    }
  }
  async createMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) return this.mainWindow;
    const window = this.createWindow({
      width: 1120,
      height: 760,
      minWidth: 900,
      minHeight: 620,
      show: false,
      title: "LexiFlow"
    });
    this.mainWindow = window;
    window.once("ready-to-show", () => window.show());
    window.on("close", (event) => {
      if (!this.isQuitting && this.getCloseAction() === "hide") {
        event.preventDefault();
        window.hide();
      }
    });
    window.on("closed", () => {
      this.mainWindow = null;
    });
    await this.loadRenderer(window);
    return window;
  }
  async showMainWindow(route = "/") {
    const window = await this.createMainWindow();
    if (route !== "/") window.webContents.send("navigation:open", route);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
  async ensurePopupWindow() {
    if (this.popupWindow && !this.popupWindow.isDestroyed()) return this.popupWindow;
    const window = this.createWindow({
      width: 480,
      height: 420,
      minWidth: 360,
      minHeight: 240,
      maxHeight: 500,
      show: false,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: "LexiFlow 快速翻译"
    });
    this.popupWindow = window;
    window.on("blur", () => {
      if (!this.popupPinned && this.shouldAutoHidePopup()) window.hide();
    });
    window.on("closed", () => {
      this.popupWindow = null;
    });
    await this.loadRenderer(window, "/popup");
    return window;
  }
  async showPopup(payload) {
    const window = await this.ensurePopupWindow();
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const bounds = display.workArea;
    const [width, height] = window.getSize();
    const x = Math.min(Math.max(cursor.x + 16, bounds.x), bounds.x + bounds.width - width);
    const y = Math.min(Math.max(cursor.y + 16, bounds.y), bounds.y + bounds.height - height);
    window.setPosition(Math.round(x), Math.round(y), false);
    window.showInactive();
    window.webContents.send(IPC_CHANNELS.popupPayload, payload);
  }
  hidePopup() {
    this.popupWindow?.hide();
  }
  setPopupPinned(pinned) {
    this.popupPinned = pinned;
  }
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let settingsStore;
  let historyStore;
  let windowManager;
  let hotkeyManager;
  let trayManager;
  let translationManager;
  const triggerSelection = async (mode) => {
    await windowManager.showPopup({ mode, capturing: true });
    translationManager.cancel();
    const selection = await captureSelectedText(settingsStore.get().translation.maxInputLength);
    await windowManager.showPopup({ mode, text: selection.text, error: selection.error });
  };
  const applySettings = (settings) => {
    app.setLoginItemSettings({ openAtLogin: settings.startup.enabled });
    const shortcutResult = hotkeyManager.register(settings.shortcuts);
    trayManager.update(settings.shortcuts);
    return shortcutResult;
  };
  app.whenReady().then(async () => {
    settingsStore = new SettingsStore();
    historyStore = new HistoryStore();
    await Promise.all([settingsStore.initialize(), historyStore.initialize()]);
    windowManager = new WindowManager(
      () => settingsStore.get().window.closeAction,
      () => settingsStore.get().window.autoHidePopup
    );
    translationManager = new TranslationManager(settingsStore, historyStore);
    hotkeyManager = new HotkeyManager((mode) => void triggerSelection(mode));
    trayManager = new TrayManager({
      openMain: () => void windowManager.showMainWindow(),
      quickTranslate: () => void triggerSelection("technical"),
      naming: () => void triggerSelection("naming"),
      openSettings: () => void windowManager.showMainWindow("/settings"),
      togglePaused: (paused) => {
        const settings = settingsStore.get();
        settings.shortcuts.paused = paused;
        void settingsStore.update(settings).then(() => applySettings(settingsStore.get()));
      },
      quit: () => app.quit()
    });
    trayManager.create(settingsStore.get().shortcuts);
    applySettings(settingsStore.get());
    registerIpcHandlers({
      settingsStore,
      historyStore,
      translationManager,
      windowManager,
      applySettings
    });
    await windowManager.ensurePopupWindow();
    app.on("activate", () => void windowManager.showMainWindow());
    app.on("second-instance", () => void windowManager.showMainWindow());
  });
  app.on("before-quit", () => {
    windowManager?.setQuitting(true);
    hotkeyManager?.unregister();
    trayManager?.destroy();
  });
  app.on("window-all-closed", () => {
  });
}
