# LexiFlow Agent Guide

## 开始前

- 产品目标、范围与非目标：`docs/product-context.md`。
- 进程边界、数据流与构建产物：`docs/architecture.md`。
- 环境、命令与改动检查：`docs/development.md`；风险审查：`docs/review-guide.md`。
- 用户操作、排障和发布：`docs/user-guide.md`、`docs/troubleshooting.md`、`docs/release-checklist.md`；完整路由：`docs/README.md`。
- 跨模块或需要阶段性验证的工作在 `docs/exec-plans/active/` 建立计划，并从 `docs/exec-plans/_template.md` 开始。

## 不可突破的边界

- 桌面端为 Electron + Vue 3 + TypeScript。系统能力与模型调用只在主进程；渲染进程不得直接使用 Node.js。
- 新能力经 preload 白名单暴露，须同步更新 `electron/shared/types.ts` 的 `IPC_CHANNELS`、`electron/shared/api.ts` 的 `TranslatorApi`、preload、IPC 注册和浏览器预览适配器。
- 发送用户内容的模型调用必须经 `resolveModelAccess()`，支持取消并校验 `requestId`；交互任务和文档任务统一由 `ModelTaskScheduler` 调度。
- API Key 只能经 Electron `safeStorage` 持久化，不得写入日志、普通 JSON 或诊断导出。

## 工程决策

- 先追踪真实调用链、数据流和受影响边界，再修改代码或文档。
- 选择最小正确改动，优先复用既有模块、标准能力和已安装依赖。
- 在能覆盖全部受影响路径的最窄共享位置修复根因；不为假设性需求创建抽象。
- 不以更小 diff 换取验证、隐私、安全、可访问性或明确需求的缺失。
- 验证与风险相称；提交前至少运行 `pnpm test` 与 `pnpm build`，必要时运行 `pnpm test:e2e` 和相应人工回归。

## 文档维护

- 代码是当前行为的依据；`docs/archive/` 仅保留历史背景，不得据此推断现状。
- 工作期间更新对应活动计划；完成后移入 `docs/exec-plans/completed/` 并更新计划索引。
- 只把稳定、难从代码恢复且会影响后续工作的事实写入持久文档。修改 `AGENTS.md`、架构或产品上下文前先提出建议并取得确认。
