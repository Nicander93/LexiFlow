# LexiFlow 架构说明

LexiFlow 由 Electron 主进程、preload 白名单桥和 Vue 渲染进程组成。主进程持有所有系统能力与模型访问；渲染进程只通过 `TranslatorApi` 使用这些能力。

## 进程拓扑

```text
electron/main/index.ts
  └─ bootstrap/application.ts
       ├─ storage/*
       ├─ provider/*
       ├─ translation/manager.ts
       ├─ document/manager.ts
       ├─ selection/controller.ts
       ├─ window/manager.ts
       ├─ tray/manager.ts
       └─ ipc/register.ts
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
| `electron/main/selection/` | 全局鼠标钩子适配、拖选判定、待确认文本与提示生命周期 |
| `electron/main/translation/` | 交互翻译、Session、句段切分与结果组装 |
| `electron/main/document/` | 导入、分块、后台队列、暂停/取消/恢复 |
| `electron/main/dictionary/` | ECDICT 只读查询 |
| `electron/main/ocr/` | Windows 截屏与 OCR |
| `electron/main/storage/` | 设置、历史、术语表、Profile、文档任务和 schema 迁移 |
| `electron/main/provider/` | Ollama / OpenAI-compatible 实现 |
| `electron/main/ipc/` | 通道注册与可信发送方校验 |
| `electron/shared/` | `TranslatorApi`、`IPC_CHANNELS`、共享类型、默认值和纯逻辑 |
| `src/features/` | 渲染侧按功能聚合的状态与 UI |
| `src/pages/` | 路由页面和页面级编排 |
| `src/platform/` | preload 获取与浏览器预览适配器 |

## 翻译主路径

1. 渲染进程创建请求并保存当前 `requestId`。
2. 主进程清理输入、解析 Profile，并通过 `resolveModelAccess()` 判定 Provider、模型和远程权限。
3. `ModelTaskScheduler` 串行化模型生成；交互任务优先于后台文档分块。
4. Provider 以流式事件返回结果，渲染进程丢弃旧 `requestId` 事件。
5. 句段、候选和命名结果经过 schema 校验；失败时最多修复一次，再回退到安全结果。
6. 结果写入当前 `TranslationSession`，按设置决定是否写入本地历史。

普通翻译、局部重译、候选译法、词典上下文和文档分块都不得绕过模型访问校验和任务调度。

## 划词路径

1. `uiohook-napi` 适配器只向内部接口暴露全局 `mousedown` / `mouseup`。
2. `SelectionMonitor` 判定有效拖选，并将物理屏幕坐标转换为 Electron DIP。
3. 选区仍拥有焦点时，主进程临时保存剪贴板、模拟 `Ctrl+C`、读取文本并恢复剪贴板。
4. `SelectionController` 缓存待确认文本，在选区下方显示 Logo。
5. 用户点击 Logo 后，控制器消费缓存文本并打开快速翻译窗；取消、超时或关闭开关会清空缓存。

## IPC 与安全

渲染进程启用 `contextIsolation: true`、`nodeIntegration: false` 和 sandbox。新 IPC 必须同步：

- `electron/shared/types.ts` 的 `IPC_CHANNELS`
- `electron/shared/api.ts` 的 `TranslatorApi`
- `electron/preload/index.ts`
- `electron/main/ipc/register.ts`
- `src/platform/translator.ts` 浏览器预览适配器

敏感 IPC 使用 `assertTrustedSender()` 校验主 Frame 与来源。preload 产物固定为 CommonJS `.cjs`，主进程保持 ESM。

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

诊断导出不得包含原文、译文、文档正文或 API Key。OCR 临时图片在 `finally` 中删除。

## 构建契约

- Renderer：`dist/`
- Main ESM：`dist-electron/main/index.js`
- Preload CJS：`dist-electron/preload/index.cjs`
- 原生依赖通过 `asarUnpack` 分发
- ECDICT 通过 `extraResources` 分发
- `scripts/verify-build.mjs` 在构建后验证入口和资源契约