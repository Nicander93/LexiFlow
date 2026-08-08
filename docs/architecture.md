# LexiFlow 架构说明

LexiFlow 由 Electron 主进程、preload 白名单桥和 Vue 渲染进程组成。主进程持有所有系统能力与模型访问；渲染进程只通过 `TranslatorApi` 使用这些能力。

## 进程拓扑

```text
electron/main/index.ts
  └─ bootstrap/application.ts
       ├─ storage/*
       ├─ application/settings + application/translation
       ├─ domain/translation (ports)
       ├─ provider/*
       ├─ translation/manager.ts
       ├─ document/manager.ts + task-queue.ts + translation-worker.ts
       ├─ selection/controller.ts
       ├─ window/manager.ts
       ├─ tray/manager.ts
       └─ interfaces/ipc/register-all.ts → 按领域 registrar 组合；ipc/register.ts 仅保留兼容导出
            └─ preload/index.ts
                 └─ window.translator
                      └─ Vue pages + features
```

`bootstrap/application.ts` 只负责实例化模块、连接接口和退出清理。具体生命周期由对应模块隐藏：划词由 `SelectionController` 管理，模型任务由 `ModelTaskScheduler` 管理，窗口由 `WindowManager` 管理。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `electron/main/bootstrap/` | 应用装配与退出顺序 |
| `electron/main/core/` | 访问校验、模型路由、调度、prompt、结构化校验、文本清理和诊断 |
| `electron/main/core/settings-transaction.ts` | 设置先注册后持久化，失败回滚运行时快捷键 |
| `electron/main/selection/` | 全局鼠标钩子适配、拖选判定、待确认文本与提示生命周期 |
| `electron/main/application/` | SettingsUseCases、领域应用服务与可脱离 Electron UI 测试的 TranslationEngine |
| `electron/main/domain/` | 翻译 ports 与纯业务边界 |
| `electron/main/translation/` | 交互翻译、Session、句段切分、结果组装和 RequestCoordinator lanes |
| `electron/main/document/` | manager facade、导入/导出服务、独立任务队列与分块翻译 worker |
| `electron/main/dictionary/` | ECDICT 只读查询 |
| `electron/main/ocr/` | 屏幕捕获、归一化坐标、内存裁剪、Windows OCR 引擎和取消/超时 |
| `electron/main/storage/` | 设置、历史、术语表、Profile、文档任务和 schema 迁移 |
| `electron/main/provider/` | Ollama / OpenAI-compatible 实现 |
| `electron/main/ipc/` | 旧注册入口兼容导出、DTO 运行时校验与可信发送方校验 |
| `electron/main/interfaces/ipc/` | 按领域 IPC registrar 与唯一组合边界 |
| `electron/shared/contracts/` | 按领域定义 IPC DTO、`TranslatorApi` 与 `IPC_CHANNELS`；`shared/types.ts` / `shared/api.ts` 仅保留兼容导出 |
| `electron/shared/` | 兼容导出、默认值、翻译状态 reducer 和纯逻辑 |
| `src/features/` | 渲染侧按功能聚合的状态与 UI |
| `src/pages/` | 路由页面和页面级编排 |
| `src/platform/` | preload 获取与浏览器预览适配器 |

Renderer 的主产品入口是无固定侧栏的翻译工作台：`MainAppShell` 提供紧凑顶栏，`TranslationPage` 只组合 workbench、translation、dictionary、OCR 与 history feature。词典、短句、长文双语阅读和命名由输入及模式驱动；历史作为右侧 overlay drawer 恢复同一翻译 Session。`/history` 与 `/naming` 仅保留兼容入口并回到工作台，文档、设置和关于仍是独立 route。

## 翻译主路径

1. 渲染进程创建请求并保存当前 `requestId`。
2. 主进程清理输入、解析 Profile，并通过 `resolveModelAccess()` 判定 Provider、模型和远程权限。
3. `ModelTaskScheduler` 串行化模型生成；交互任务优先于后台文档分块，`RequestCoordinator` 按主窗口、弹窗、修订、候选和词典 lane 独立取消。
4. Provider 以流式事件返回结果，主进程 Session 和 Renderer 使用同一个 `reduceTranslationState`，并丢弃旧 `requestId` 事件。
5. 句段、候选和命名结果经过 schema 校验；失败时最多修复一次，再回退到安全结果。
6. 结果写入当前 `TranslationSession`，按设置决定是否写入本地历史。

普通翻译、局部重译、候选译法、词典上下文和文档分块都不得绕过模型访问校验和任务调度；交互与文档在 bootstrap 中共享同一个 `TranslationEngine` 实例，文档分块通过它复用清理、Profile、术语和结构化分段管线。Provider factory 由组合层注入，不由 Manager 或 IPC registrar 直接创建。

设置修改通过主进程 `SettingsService` 串行执行字段级 patch。窗口自动适配只改变尺寸，不持久化 `popupBounds`；用户拖动尺寸经过 300ms 防抖后才写入。

OCR 先捕获接近物理像素的屏幕图像并返回短期 `captureId`，Renderer 只发送归一化选区，主进程再内存裁剪并只对裁剪区域调用 Windows OCR。识别、取消或超时都会释放缓存和临时文件。

## 划词路径

1. `uiohook-napi` 适配器只向内部接口暴露全局 `mousedown` / `mouseup`。
2. `SelectionMonitor` 判定有效拖选，并将物理屏幕坐标转换为 Electron DIP。
3. 选区仍拥有焦点时，主进程临时保存剪贴板、模拟 `Ctrl+C`、读取文本并恢复剪贴板。
4. `SelectionController` 缓存待确认文本，在选区下方显示 Logo。
5. 用户点击 Logo 后，控制器消费缓存文本并打开快速翻译窗；取消、超时或关闭开关会清空缓存。

## IPC 与安全

渲染进程启用 `contextIsolation: true`、`nodeIntegration: false` 和 sandbox。新 IPC 必须同步：

- `electron/shared/contracts/channels.ts` 的 `IPC_CHANNELS`
- `electron/shared/api.ts` 的 `TranslatorApi`
- `electron/preload/index.ts`
- `electron/main/interfaces/ipc/register-*-ipc.ts`（按领域注册 handler）
- `electron/main/interfaces/ipc/register-all.ts`（唯一组合入口）；`electron/main/ipc/register.ts` 仅为旧调用方保留导出兼容层
- `src/platform/translator.ts` 浏览器预览适配器

敏感 IPC 使用 `assertTrustedSender()` 校验主 Frame 与来源。registrar 只负责 sender 校验、DTO 解析和调用应用服务；文件、Provider、剪贴板等副作用由应用服务或 bootstrap 注入的 port 承担。preload 产物固定为 CommonJS `.cjs`，主进程保持 ESM。

## 本地数据与隐私

| 数据 | 存储 |
| --- | --- |
| 设置 | `settings.json`，API Key 除外 |
| API Key | Electron `safeStorage` |
| 历史 | `history.json`，带迁移 |
| Profile | `profiles.json`，带 schemaVersion |
| 文档任务 | `document-tasks.json`，带 schemaVersion |
| 术语表 | 本地 JSON |
| 词典 | 安装包内只读 SQLite |

诊断导出不得包含原文、译文、文档正文或 API Key。OCR 临时图片在 `finally` 中删除。`JsonStore` 只对 `ENOENT` 使用默认值；损坏 JSON 会被隔离为带时间戳的 `.corrupt.*.json`，权限和 IO 错误继续向上抛出。

## 构建契约

- Renderer：`dist/`
- Main ESM：`dist-electron/main/index.js`
- Preload CJS：`dist-electron/preload/index.cjs`
- 原生依赖通过 `asarUnpack` 分发
- ECDICT 通过 `extraResources` 分发
- `scripts/verify-build.mjs` 在构建后验证入口和资源契约
