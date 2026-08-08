# VNext 翻译工作台重构

状态：`completed`  
创建：2026-08-08  
最近更新：2026-08-08

## 背景

当前 Renderer 仍以固定侧栏和多个功能页面组织；配套设计稿要求收敛为打开即用的翻译工作台，并用内容驱动词典、短句、长文、命名结果。现有主进程分层、翻译管线、调度器与文档队列保持不变。

## 目标

- 默认路由直接呈现无侧栏工作台，并匹配暖白、低饱和绿色、紧凑桌面工具的视觉语言。
- 单词、短句、长文与命名使用适配的结果视图；历史在右侧抽屉中完成搜索、收藏与恢复。
- 快速翻译 Popup、设置、文档和关于页统一为 VNext 视觉与信息架构。
- 保留 Renderer → TranslatorApi → preload → IPC → application 的边界并通过完整工程检查。

## 范围

### 包含

- App Shell、工作台、结果解析与结果视图、History Drawer、Naming mode。
- Popup 临时/固定状态、主窗口 handoff 与 OCR 入口体验。
- Settings/Documents/About 视觉收敛，旧路由兼容和无用 UI/CSS 清理。
- 历史 kind/origin/usageCount 迁移、策略测试、E2E 与稳定架构文档。

### 不包含

- 重写 TranslationEngine、ModelTaskScheduler、RequestCoordinator 或文档任务队列。
- 删除 GlossaryStore 的底层存储契约。
- 实现任意数量的 Popup 窗口池。

## 方案与影响面

- Renderer 以 feature 组件和 controller 承担状态，page 仅负责编排；逐步迁移，不新增 UI 框架。
- 只有 handoff、窗口固定或历史记录确需新能力时才同步更新 shared contract、preload、IPC registrar 与预览适配器。
- 所有模型请求继续复用现有 `useTranslation` 和主进程调用链，保留取消与 `requestId` 过滤。
- 历史升级采用向后兼容迁移，保留收藏、修订和原文/译文；诊断不增加用户内容。

## 任务

- [x] 审计现有 Renderer、窗口、历史和测试基线。
- [x] 实现 MainAppShell、WorkbenchTopbar 与 WorkbenchPage。
- [x] 实现内容驱动的词典、短句、双语阅读和命名结果。
- [x] 实现 History Drawer、恢复、搜索、收藏及兼容路由。
- [x] 重构 Quick Translation Popup 与 OCR 工作台入口。
- [x] 收敛 Settings、Documents、About 和全局 design tokens。
- [x] 完成历史迁移、纯策略测试、E2E、架构规则与文档更新。
- [x] 清理旧主导航路径，并完成完整自动化回归。

## 验证

- [x] `pnpm run typecheck`
- [x] `pnpm run lint`
- [x] `pnpm run format:check`
- [x] `pnpm test`（39 files / 162 tests）
- [x] `pnpm build`
- [x] `pnpm run check`
- [x] `pnpm test:e2e`（11 passed；原生 OCR 与真实 Ollama 依环境跳过）
- [x] Windows Electron 900×620 视觉回归：默认工作台、设计稿 Logo、顶部工具栏、命名下拉框、词典结果与设置页截图校核。
- [ ] Windows 人工回归：DPI、划词、Popup blur/pin、OCR 多屏/取消/超时。

## 风险与回滚

- 风险：跨页面状态迁移可能影响会话恢复；通过兼容路由、策略单测和逐阶段构建缓解。
- 风险：Popup 与 OCR 的真实窗口行为无法完全由 DOM E2E 覆盖；保留明确的 Windows 人工回归项。
- 回滚：各阶段保持独立 feature/component 边界，可按文件恢复旧页面编排，不迁移或删除用户数据。

## 结果与遗留

- 结果：VNext 工作台、原设计稿手写 Logo 与叶片标、无框窗口顶部栏、内容驱动结果、历史抽屉、命名模式、Popup、OCR overlay、五类设置与历史 v3 迁移已落地；完整工程检查与 Electron 截图回归通过。
- 视觉证据：`artifacts/ui-verification/` 保存默认工作台、命名、词典和设置四张实际 Electron 截图。
- 遗留：原生 OCR 多屏/DPI 与真实 Ollama 仍需在具备对应环境的 Windows 机器人工回归；底层 GlossaryStore 按范围保留。
- 文档：已更新本计划与 `docs/architecture.md` 的 Renderer 结构。
