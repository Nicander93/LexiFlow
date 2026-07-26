# LexiFlow Agent Guide

- 桌面端：Electron + Vue 3 + TypeScript。主进程负责系统能力与模型调用；渲染进程禁止直接使用 Node.js。
- 新增能力一律经 preload 白名单暴露；契约在 `electron/shared/api.ts`，通道名在 `electron/shared/types.ts` 的 `IPC_CHANNELS`。
- Provider、提示词与 UI 解耦。凡发送用户内容的模型调用必须：可取消、校验 `requestId`、经 `resolveModelAccess()`。
- 当前范围含 v0.1 划词闭环，以及 V2 句段/词典与 V3 Profile/术语表/OCR/文档/隐私（详见 `docs/architecture.md`、`docs/review-guide.md`）。
- API Key 仅经 Electron `safeStorage` 持久化，不得写入日志或诊断导出。
- 提交前至少运行 `pnpm test` 与 `pnpm build`。
