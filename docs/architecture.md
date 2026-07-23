# 架构说明

LexiFlow 分为 Electron 主进程、preload 白名单桥和 Vue 渲染进程。

- 主进程管理托盘、快捷键、窗口、剪贴板、Provider、设置和历史。
- preload 仅暴露固定的设置、翻译、历史、剪贴板和窗口 API。
- 渲染进程负责主窗口与悬浮窗 UI，不直接访问 Node.js 或模型服务。
- `TranslationProvider` 统一 Ollama 与 OpenAI-compatible 的健康检查、模型列表和流式翻译。
- 每次翻译都分配 requestId；新请求、停止、关闭悬浮窗和退出应用都会取消旧请求。
- 设置与历史通过原子替换写入本地 JSON；API Key 单独使用操作系统安全存储加密。
- preload API 定义在 `electron/shared/api.ts`，并通过 `runtime.ping()` 提供版本化运行时握手。
- sandbox preload 固定构建为 CommonJS `.cjs`；主进程保持 ESM，避免两种模块语义混用。

选区读取会暂存剪贴板内容，写入唯一标记后模拟 Ctrl+C，轮询新文本并在 finally 中恢复原剪贴板。悬浮窗在复制前即进入 capturing 状态，模型响应不影响窗口出现速度。

## 启动与验证

- `electron/main/index.ts` 只负责单实例与失败退出，应用装配集中在 `bootstrap/application.ts`。
- preload 加载失败或 renderer 崩溃会在主进程留下不含请求正文的诊断信息。
- 生产环境缺少 preload API 时，渲染层显示明确的启动诊断页，不再静默白屏。
- `scripts/verify-build.mjs` 验证 main、preload 与 renderer 的产物契约。
- Playwright Electron E2E 验证真实 preload、路由和 IPC；设置 `LEXIFLOW_E2E_MODEL` 后会追加 Ollama 真机翻译测试。

## 样式结构

- `tokens.css`：颜色、圆角、阴影和动效变量。
- `base.css`：全局元素、输入控件与可访问性基础。
- `layout.css`：应用壳、侧栏和页面容器。
- `components.css`：按钮、状态、通用面板与反馈。
- `pages.css`：翻译、命名、历史、设置和关于页布局。
- `popup.css`：独立的悬浮翻译窗口样式。
