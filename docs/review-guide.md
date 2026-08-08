# LexiFlow 代码审查指南

本指南面向日常改动审查。先确认进程边界和数据流，再检查模型调用、持久化与退出清理，最后执行自动化验证和人工验收。

## 审查入口

- 应用装配：`electron/main/bootstrap/application.ts`
- IPC 注册组合：`electron/main/interfaces/ipc/register-all.ts`；领域实现：`electron/main/interfaces/ipc/register-*-ipc.ts`；旧入口仅保留导出兼容
- 共享契约：`electron/shared/api.ts`、`electron/shared/types.ts`
- Preload 白名单：`electron/preload/index.ts`
- 交互翻译：`electron/main/translation/manager.ts`
- 文档任务：`electron/main/document/manager.ts`
- 划词闭环：`electron/main/selection/`
- 渲染功能：`src/features/`

## 必查边界

### Electron 安全

- 渲染进程不得直接访问 Node.js。
- 新增能力必须同时更新 `IPC_CHANNELS`、共享 API 类型、preload、IPC 注册和浏览器预览桩。
- IPC 参数在主进程入口校验，不能信任渲染进程输入。
- 变更型 IPC 必须使用可信 sender 和运行时 DTO 校验；设置写入必须使用 `SettingsService` patch。
- API Key 只能经 `safeStorage` 保存，不能进入日志、普通 JSON 或诊断导出。

### 模型调用

- 所有发送用户内容的路径都必须经过 `resolveModelAccess()`。
- 每个调用必须可取消，并校验当前 `requestId` 后才能更新状态。
- 交互请求与文档任务统一经 `ModelTaskScheduler` 调度；交互请求优先。
- 结构化输出先校验，必要时只允许一次修复，再采用明确的降级路径。

### 划词翻译

- `SelectionController` 负责启停、确认、取消和退出清理。
- `SelectionMonitor` 只负责选择状态判断，不直接操作窗口。
- 原生鼠标钩子只通过 `uiohook-adapter.ts` 接入，避免原生依赖扩散。
- 提示位置使用 DIP 坐标，并在多屏和不同缩放比例下验收。
- 设置关闭后必须停止监听并立即收起待处理提示。

### 本地数据

- 本地 JSON 结构变化需要 schema 版本或兼容迁移。
- 历史、Profile、术语表、文档任务和设置的清除范围必须与隐私入口一致。
- OCR 临时图片在 `finally` 中删除，不持久化原图。
- OCR 必须先框选后识别，使用归一化坐标和短期 `captureId`，并覆盖取消/超时错误。
- JSON 读取必须区分文件不存在、损坏和权限/IO 错误；损坏文件要隔离而不是静默覆盖。
- 诊断数据只能包含环境和匿名计数，不得包含用户正文。

## 渲染层约定

- 页面只负责场景编排，功能 UI 和组合逻辑放在 `src/features/<feature>/`。
- 跨场景基础组件保留在 `src/components/`。
- Electron API 统一从 `src/platform/translator.ts` 获取。
- 设置项采用自动保存；新增字段同时更新默认值、校验、共享类型和预览桩。
- 翻译状态事件必须通过共享 reducer；交互请求按 lane 取消，不能用单一全局活动请求。

## 改动联动表

| 改动 | 需要同步检查 |
| --- | --- |
| 新增 IPC | 通道、共享类型、preload、主进程注册、预览桩、测试 |
| 新增模型路径 | 访问校验、调度、取消、`requestId`、错误归一化 |
| 修改结构化输出 | prompt、校验器、降级策略、UI、测试、Prompt 版本 |
| 修改设置字段 | 默认值、校验、存储、API 类型、设置页、自动保存 |
| 修改本地数据 | schema、迁移、隐私清除、诊断脱敏、测试 |
| 修改划词交互 | 开关生命周期、坐标换算、多屏缩放、失焦与退出清理 |

## 验证

```powershell
pnpm test
pnpm build
pnpm test:e2e
```

自动化通过后，按 `docs/release-checklist.md` 完成人工验收。真实模型和安装包验证不能由单元测试替代。
