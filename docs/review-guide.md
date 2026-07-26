# LexiFlow 代码审查指南

面向本地 review：先看边界和数据流，再下钻编排入口，最后对照测试与验收清单。

相关文档：

- 架构与数据流：`docs/architecture.md`
- 故障排查：`docs/troubleshooting.md`
- V3 验收：`docs/v3-acceptance.md` / `docs/v3-privacy-acceptance.md`
- 剩余手工项：`docs/v3-next-steps.md`
- PRD：`docs/LexiFlow_V2_V3_PRD_v1.1.md`

## 1. 版本范围

| 层 | 能力 | 关键代码 |
| --- | --- | --- |
| v0.1 | 划词、托盘、悬浮窗、Ollama/OpenAI、流式取消、历史与设置 | `clipboard/` `hotkey/` `window/` `tray/` `provider/` `translation/manager`（基础路径） |
| V2 | 文本清理、稳定句段、结构化译文、词典、历史 schema 迁移 | `core/text-cleanup` `translation/segments` `translation/result` `core/structured` `storage/dictionary` `storage/history-policy` |
| V3 | Profile / 术语表 / OCR / 文档队列 / 模型门禁 / 隐私清除 / 诊断 | `core/profile-policy` `core/model-request-gate` `storage/glossary` `storage/profiles` `ocr/` `document/` `core/diagnostics` |

当前 Prompt 版本：`PROMPT_VERSION = "v3.1"`（`electron/shared/defaults.ts`）。改 prompt 规则或结构化 schema 时同步 bump。

## 2. 进程拓扑

```
index.ts（单实例 / E2E userData）
  └─ bootstrap/application.ts（装配 Store / Manager / IPC / 托盘）
       ├─ storage/*          本地 JSON + safeStorage
       ├─ translation/manager  交互翻译编排
       ├─ document/manager     文档单并发队列
       ├─ ocr/windows-ocr      选屏截图 → 临时 PNG → Windows OCR
       ├─ ipc/register.ts      IPC_CHANNELS → handlers
       └─ preload → window.translator → Vue（src/）
```

信任边界：

- 渲染进程：`contextIsolation` + `sandbox`，无 Node。
- 唯一桥：`electron/shared/api.ts` 类型 + `preload/index.ts` 实现。
- 通道名集中在 `electron/shared/types.ts` 的 `IPC_CHANNELS`。
- API Key 只进 `safeStorage`，不得进日志、诊断导出或普通 JSON。

浏览器预览 stub 在 `src/platform/translator.ts` 的 `installBrowserPreviewApi()`，仅用于非 Electron 视觉预览，不能当作真实 preload 行为。

## 3. 审查优先文件

按风险与复杂度排序，建议按此顺序读：

| 优先级 | 文件 | 看什么 |
| --- | --- | --- |
| P0 | `bootstrap/application.ts` | 装配顺序、退出清理、`clear-on-exit`、托盘不退出 |
| P0 | `ipc/register.ts` | 通道是否都接到正确 Manager；有无绕过校验的写入 |
| P0 | `translation/manager.ts` | `requestId` 取消、门禁、结构化修复、历史写入 |
| P0 | `document/manager.ts` | 单队列、暂停/取消、失败分块重试、与交互门禁抢占 |
| P0 | `core/profile-policy.ts` | `resolveModelAccess`：禁远程 / 远程确认 / 模型路由 |
| P1 | `core/structured.ts` | schema 校验、一次修复、匿名失败计数 |
| P1 | `core/model-request-gate.ts` | 交互优先于文档 |
| P1 | `ocr/windows-ocr.ts` | 临时 PNG 必删、非 win32 拒绝、不落盘原图 |
| P1 | `shared/api.ts` + `preload/index.ts` | 白名单是否与 `IPC_CHANNELS` 一致 |
| P1 | `storage/settings.ts` / `history-policy.ts` | 加密与 schema 迁移失败行为 |
| P2 | `translation/segments.ts` / `document/chunking.ts` | 切分边界（URL/代码/括号等） |
| P2 | `shared/quality.ts` | 启发式质量检查（渲染侧可复用） |

## 4. 翻译主路径（交互）

1. 输入清理：`cleanInputText`
2. 句段切分：`splitIntoSegments`（稳定 `segmentId`）
3. 门禁：`resolveModelAccess(profile, settings, …)` —— 禁止自行绕过
4. 并发：`modelRequestGate.beginInteractive()`；新请求 / 停止会 `cancel` 旧 `AbortController`
5. Provider 流式输出；句段模式要求按本地 ID 回 JSON
6. `validateSegmentResponse`；失败则 `chat` 一次修复；再失败回退全文译文
7. `createTranslationResult` → 可选写历史

局部重译、候选译法、词典上下文走同一 Manager，各自独立 `requestId` 与事件通道。

候选译法产品规则（已定）：**3 个** —— `推荐译法` / `直译` / `正式表达`。改数量或标签需同步 prompt、schema、UI、测试。

## 5. 文档与 OCR

文档：

- 格式：TXT / Markdown / SRT / 可提取文本 PDF / 常见代码与配置
- 扫描 PDF 不 OCR，提示先走截图 OCR
- 单并发队列；交互请求可抢占文档分块
- 启动时中断任务恢复为 `paused`（`task-state.recoverDocumentTask`）
- 失败分块记在 `failedChunks`，可单独重试

OCR（第一阶段）：

- 选屏 → 全屏缩略图预览 → 框选/点选 → 可编辑文本 → 再翻译
- 临时 PNG 写在 `app.getPath("temp")`，`finally` 删除
- 不提供原生跨屏区域框选

## 6. 本地存储清单

默认目录：`%APPDATA%/LexiFlow`（E2E 可能使用临时 userData）。

| 文件 | schemaVersion | 备注 |
| --- | --- | --- |
| `settings.json` | — | API Key 不在此明文；走 safeStorage |
| `history.json` | 1 | 旧数组 / `targetText` → `items[].resultText`；迁移写失败不阻断启动 |
| `profiles.json` | 1 | 缺省 `allowRemote` 视为允许 |
| `glossary` 相关 JSON | — | CRUD + CSV；按源/目标语言筛选命中 |
| `dictionary-cache.json` | — | 缓存写失败不影响查询结果 |
| `document-tasks.json` | 1 | 保留 `failedChunks`；启动 recover → paused |
| 诊断导出 | 1 | 仅环境信息与匿名解析失败计数 |

## 7. 隐私审查要点

- Profile `allowRemote === false` → 禁止 `openai-compatible`
- 远程 Provider 必须 `remoteUsageConfirmed === true`
- `privacy:clear-local-data` 清历史、词典缓存、术语表、Profile、文档任务、设置
- `diagnostics:export` 不得含原文、译文、文档内容、API Key（单测在 `tests/diagnostics.test.ts`）
- OCR 临时图与用户确认远程发送：对照 `docs/v3-privacy-acceptance.md`

## 8. 测试对照

```bash
pnpm test          # 门禁、结构化、文档任务、诊断脱敏等
pnpm build         # typecheck + vite + verify-build 契约
pnpm test:e2e      # Windows 上建议带 GPU 降级参数（已写入配置）
```

真机模型：`$env:LEXIFLOW_E2E_MODEL="qwen3.5:9b"`  
打包冒烟：`$env:LEXIFLOW_EXECUTABLE="release/win-unpacked/LexiFlow.exe"`

单元测试与能力的大致对应：

| 测试 | 覆盖 |
| --- | --- |
| `profile-policy` / `model-routing` / `model-request-gate` | 门禁与抢占 |
| `structured` / `translation-result` / `alternatives` | 解析与回退 |
| `document-chunking` / `document-task` | 分块与状态机 |
| `history-policy` / `dictionary` / `glossary` | 存储与迁移 |
| `diagnostics` / `quality` / `text-cleanup` | 脱敏与启发式 |

## 9. 常见漏改点

改这些能力时，容易漏同步：

1. 新模型调用路径 → 必须过 `resolveModelAccess` + 可取消
2. 新 IPC → 同步 `types.IPC_CHANNELS`、`api.ts`、`preload`、`register.ts`
3. 结构化 JSON 字段 → `structured.ts`、prompt、UI、`PROMPT_VERSION`
4. 本地 JSON 字段 → schemaVersion / 迁移 / 清除本地数据列表
5. 候选标签或数量 → prompt / schema / ResultPanel / 测试
