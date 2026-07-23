# LexiFlow Agent Guide

- 桌面端采用 Electron + Vue 3 + TypeScript，主进程负责系统能力和模型调用。
- 渲染进程禁止直接使用 Node.js；新增能力统一通过 preload 白名单 API 暴露。
- Provider、提示词和 UI 保持解耦，模型请求必须可取消并校验 requestId。
- v0.1 以 Windows 划词翻译闭环为优先，不扩展 OCR、插件或账号体系。
- API Key 通过 Electron safeStorage 加密持久化，不得记录到日志。
- 提交前至少运行 `npm test` 与 `npm run build`。
