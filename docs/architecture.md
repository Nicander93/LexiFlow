# 架构说明

LexiFlow 分为 Electron 主进程、preload 白名单桥和 Vue 渲染进程。按文件审查时优先看 [审查指南](review-guide.md)。

- 主进程管理托盘、快捷键、窗口、剪贴板、Provider、设置、历史，以及 V3 的 Profile / 术语表 / OCR / 文档。
- preload 仅暴露 `electron/shared/api.ts` 中的固定 API；通道名在 `IPC_CHANNELS`。
- 渲染进程负责主窗口与悬浮窗 UI，不直接访问 Node.js 或模型服务。
- `TranslationProvider` 统一 Ollama 与 OpenAI-compatible：健康检查、模型列表、流式翻译，以及结构化修复用的 `chat`。
- 每次翻译都分配 requestId；新请求、停止、关闭悬浮窗和退出应用都会取消旧请求。
- 设置与历史通过原子替换写入本地 JSON；API Key 单独使用操作系统安全存储加密。
- `runtime.ping()` 提供版本化运行时握手；sandbox preload 固定为 CommonJS `.cjs`，主进程保持 ESM。

选区读取会暂存剪贴板内容，写入唯一标记后模拟 Ctrl+C，轮询新文本并在 finally 中恢复原剪贴板。悬浮窗在复制前即进入 capturing 状态，模型响应不影响窗口出现速度。

## 模块地图

| 路径 | 职责 |
| --- | --- |
| `electron/main/index.ts` | 单实例、E2E 临时 userData，转交 bootstrap |
| `electron/main/bootstrap/application.ts` | 装配 Store / Manager / IPC / 托盘与退出清理 |
| `electron/main/ipc/register.ts` | `IPC_CHANNELS` → 各 Store/Manager |
| `electron/main/core/` | 纯逻辑：门禁、路由、prompt、结构化校验、文本清理、诊断 |
| `electron/main/translation/` | 交互翻译编排、句段切分、结果组装、候选解析 |
| `electron/main/document/` | 文档导入、分块、单并发队列、状态恢复 |
| `electron/main/ocr/windows-ocr.ts` | 选屏截图 → 临时 PNG → Windows OCR → 删图 |
| `electron/main/storage/` | 本地 JSON（含 schema 迁移）与 safeStorage |
| `electron/main/provider/` | Ollama / OpenAI-compatible 实现 |
| `electron/shared/` | 类型、IPC 通道、默认设置、`PROMPT_VERSION`、质量检查 |
| `electron/preload/index.ts` | `contextBridge` 白名单 |
| `src/platform/translator.ts` | 取 preload API；非 Electron 时安装浏览器预览 stub |
| `src/composables/useTranslation.ts` | 渲染侧翻译状态与 requestId 过滤 |

`core/profile-policy.resolveModelAccess` 是所有“会发送用户内容”的模型调用的统一入口判定；`core/model-request-gate` 保证交互请求优先于文档后台分块。

## V2 翻译数据与本地存储

- 主进程先进行文本清理和稳定句段切分。长句仅在可靠的逗号从句边界继续切分；URL、路径、代码块、数字、缩写与括号内容不会作为切分点。
- Provider 只按本地生成的 `segmentId` 返回 JSON 句段译文。解析不完整或格式非法时，结果会回退为普通全文译文，渲染进程不会按文本相似度重新匹配句段。
- 选词词典先查询本地缓存与内置词条；缓存写入失败不会影响查询结果。技术 Profile 的上下文模式才会通过当前已配置的 Provider 异步补充解释，并使用独立 requestId 支持取消。
- `history.json` 当前为 `{ schemaVersion: 1, items: [...] }`。启动时会将旧数组格式和旧 `targetText` 字段迁移为当前格式；无效条目被跳过，迁移文件无法写回时仍保留内存中的可用历史，不阻断翻译。

## V3 能力边界与数据流

### 模型访问统一门禁

所有会发送用户内容的模型调用（普通翻译、局部重译、候选译法、上下文词典、文档分块、结构化修复请求）都必须经过 `resolveModelAccess()`：

1. Profile `allowRemote === false` 时禁止 `openai-compatible`；
2. 远程 Provider 必须 `remoteUsageConfirmed === true`；
3. Profile 指定模型优先，否则按模型路由选择。

调用链不得自行绕过上述判定。交互请求通过 `ModelRequestGate` 优先于文档后台分块。

### IPC 边界（V3 增量）

| 能力 | 主进程 | Preload / Renderer |
| --- | --- | --- |
| Glossary | `glossary:*` CRUD / CSV / 冲突检测；按源/目标语言筛选命中项 | 设置页编辑；翻译页命中校验与“加入术语表” |
| Profile | `profile:*`；`allowRemote` / `modelId` / 词典模式 | 翻译、弹窗、文档导入选择 Profile |
| OCR | `ocr:list-screens` / `ocr:capture`；`ocr:capture-requested` 推送；临时 PNG 识别后删除 | 选屏 + 预览框选；可编辑识别文本；不持久化原图 |
| Document | `document:*` invoke；`document:event` 推送任务进度；单并发队列；失败分块可重试 | 文档页导入/暂停/取消/导出 |
| 隐私 | `privacy:clear-local-data`；`diagnostics:export` | 设置页确认清除；导出脱敏诊断 |

流式类通道（翻译 / 重译 / 候选 / 词典上下文）均为 `*:start` + `*:cancel` + `*:event`；渲染侧用 requestId 丢弃过期事件。

### 本地 JSON schema

| 文件 | schemaVersion | 迁移要点 |
| --- | --- | --- |
| `history.json` | 1 | 旧数组 / `targetText` → `items[].resultText`；迁移写失败不阻断启动 |
| `profiles.json` | 1 | 缺省 `allowRemote` 视为允许，保持旧数据可用 |
| `document-tasks.json` | 1 | 保留 `failedChunks`；启动恢复中断任务为 paused |
| `dictionary-cache.json` | — | 缓存写失败不影响查询结果 |
| `settings.json` | — | API Key 不落明文，走 safeStorage |
| 诊断导出 | 1 | 仅环境信息与匿名解析失败计数 |

结构化输出与结果字段与 `PROMPT_VERSION`（当前 `v3.1`）绑定；改 schema 或句段 JSON 规则时同步 bump。质量启发式在 `electron/shared/quality.ts`（主进程与渲染进程共用），注意勿用标识符名遮蔽全局 `URL`。

### 结构化输出

句段、候选译法、命名结果先做 schema 校验；失败则发起一次修复请求（只回传原始模型输出与 schema）。二次失败时回退普通文本/安全命名结构，界面不留空白。匿名失败计数写入诊断，不记录原文、译文或 API Key。

### 候选译法产品规则（已确认实现）

PRD 同时出现“默认 3 个”和四类标签（推荐/直译/自然/正式）。当前实现统一为 **3 个候选**：`推荐译法`、`直译`、`正式表达`。Prompt、解析器、UI 与测试保持一致；若产品后续要纳入“自然表达”，需同步改 schema 与数量规则。

### OCR 第一阶段限制

不提供原生跨屏区域框选。流程为：选择屏幕 → 全屏截图预览 → 在预览中框选/点选文本块 → 可编辑后送入翻译。临时 PNG 仅用于识别，成功或失败后删除。

## 启动与验证

- `electron/main/index.ts` 只负责单实例与失败退出，应用装配集中在 `bootstrap/application.ts`。
- preload 加载失败或 renderer 崩溃会在主进程留下不含请求正文的诊断信息。
- 生产环境缺少 preload API 时，渲染层显示明确的启动诊断页，不再静默白屏。
- `scripts/verify-build.mjs` 验证 main、preload 与 renderer 的产物契约。
- Playwright Electron E2E 在 Windows 上附带 `--disable-gpu --disable-software-rasterizer --in-process-gpu`，并保留 `LEXIFLOW_E2E=1` 的硬件加速与 sandbox 降级；设置 `LEXIFLOW_E2E_MODEL` 后会追加 Ollama 真机翻译测试；设置 `LEXIFLOW_EXECUTABLE` 可对打包产物做冒烟。

## 样式结构

- `tokens.css`：颜色、圆角、阴影和动效变量。
- `base.css`：全局元素、输入控件与可访问性基础。
- `layout.css`：应用壳、侧栏和页面容器。
- `components.css`：按钮、状态、通用面板与反馈。
- `pages.css`：翻译、命名、历史、文档、设置和关于页布局。
- `popup.css`：独立的悬浮翻译窗口样式。
