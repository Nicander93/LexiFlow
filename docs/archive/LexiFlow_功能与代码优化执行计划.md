# LexiFlow 功能与代码优化执行计划

> 进度（2026-07-29）：本轮优化项已全部落地；`pnpm test`（128）/ `pnpm build` 通过。剩余词典增强（拼写建议、词频排序等）可按后续迭代继续。

## 1. 文档目的

本文基于 `Nicander93/LexiFlow` 当前 `main` 分支代码整理，用于指导 Coding Agent 对现有功能、架构和交互进行优化。

本轮优化目标：

1. 修复 V2/V3 功能叠加后出现的逻辑冲突。
2. 提升翻译、文档任务和本地存储的稳定性。
3. 优化本地模型调用时的任务调度。
4. 统一 Profile、Prompt 和增强功能的行为。
5. 降低前端页面复杂度和后续维护成本。
6. 在不破坏现有功能的前提下逐步重构。

实施原则：

- 优先修复正确性问题。
- 避免无必要的大规模重写。
- 保持现有 IPC 和数据结构尽量兼容。
- 每项修改都必须补充测试。
- 按 P0、P1、P2 顺序执行。
- 每完成一个阶段，先运行测试和构建，再进入下一阶段。

---

## 2. 当前项目能力概览

当前项目已经具备以下能力：

- Windows 系统托盘常驻。
- 全局快捷键划词翻译。
- 鼠标附近悬浮翻译窗口。
- 普通翻译、技术翻译和编程命名。
- Ollama 和 OpenAI-compatible Provider。
- 模型健康检查和模型列表读取。
- 本地 ECDICT 词典。
- 单词和短语查词。
- 句段拆分和中英句段联动。
- 局部重译和候选译法。
- Profile 和术语表。
- Windows OCR。
- TXT、Markdown、SRT、PDF 文本层和代码文件翻译。
- 历史记录和收藏。
- 本地设置和 API Key 安全存储。
- 本地数据清除和诊断导出。
- 单元测试、Electron E2E 和 Windows 打包流程。

当前主要问题不是继续增加功能，而是对现有功能进行一次完整的架构收敛。

---

# 3. P0：必须优先修复的问题

## P0-1：统一 Translation Mode 与 Profile

### 当前问题

项目目前同时存在两套翻译场景控制：

- `mode`
  - `normal`
  - `technical`
  - `naming`
- `profileId`
  - `general`
  - `technical`
  - `academic`
  - `code-comment`
  - 其他自定义 Profile

当前请求进入主进程后，会读取 Profile，并将 `profile.systemPrompt` 写入请求。

Prompt 构造时优先使用 `profilePrompt`，只有 Profile Prompt 不存在时，才根据 `mode` 选择普通或技术 Prompt。

因此可能出现：

- 用户点击“技术翻译”，但当前 Profile 仍然是 `general`。
- 界面显示技术翻译，实际使用的是通用 Prompt。
- 悬浮窗默认使用技术模式，但默认 Profile 仍可能覆盖技术 Prompt。
- 用户无法理解 Mode 与 Profile 的优先级关系。

### 优化目标

将 Profile 作为翻译场景的唯一配置来源。

`mode` 不再同时承担翻译风格控制。

### 推荐方案

保留以下任务类型：

```ts
type TranslationTaskType = "translation" | "naming";
```

普通翻译和技术翻译改为 Profile 快捷入口：

- 普通翻译：选择 `general` Profile。
- 技术翻译：选择 `technical` Profile。
- 学术翻译：选择 `academic` Profile。
- 代码注释：选择 `code-comment` Profile。
- 编程命名：保留独立 `naming` 任务。

### 建议新增统一解析结构

```ts
interface ResolvedTranslationPolicy {
  profileId: string;
  systemPrompt: string;
  targetLanguage: TargetLanguage;
  temperature?: number;
  modelId?: string;
  allowRemote: boolean;
  dictionaryMode: DictionaryMode;
  enableGlossary: boolean;
  preserveMarkdown: boolean;
  preserveCode: boolean;
}
```

新增统一方法：

```ts
function resolveTranslationPolicy(
  settings: AppSettings,
  profile: TranslationProfile | undefined,
  request: TranslationRequest
): ResolvedTranslationPolicy
```

所有模型调用都必须使用解析后的 Policy。

### 涉及文件

重点检查并修改：

- `src/pages/TranslationPage.vue`
- `src/pages/PopupPage.vue`
- `src/pages/NamingPage.vue`
- `electron/main/translation/manager.ts`
- `electron/main/core/prompt.ts`
- `electron/main/core/model-access-gate.ts`
- `electron/main/storage/profiles.ts`
- `electron/shared/types.ts`
- `electron/shared/defaults.ts`

### 验收标准

必须增加测试覆盖：

1. `general` Profile 使用通用 Prompt。
2. `technical` Profile 使用技术 Prompt。
3. `academic` Profile 使用学术 Prompt。
4. 自定义 Profile 使用自定义 Prompt。
5. 悬浮窗默认翻译场景与设置一致。
6. Naming 任务不受翻译 Profile 的错误覆盖。
7. UI 中显示的场景与实际发送的 Prompt 一致。

---

## P0-2：清除本地数据时停止所有后台任务

### 当前问题

当前清除本地数据时，只调用了：

```ts
translationManager.cancel();
```

随后清除：

- HistoryStore
- GlossaryStore
- ProfileStore
- DocumentStore
- SettingsStore

但是 `DocumentManager` 可能仍然存在：

- 正在运行的分块任务。
- 等待队列中的任务。
- 仍然持有的 `AbortController`。
- 后续的 `store.upsert()` 写入。

这会导致以下竞态：

1. 用户启动文档翻译。
2. 用户点击“清除所有本地数据”。
3. `document-tasks.json` 被清空。
4. 后台分块请求随后完成。
5. 旧任务重新写回 `document-tasks.json`。

### 优化目标

清除数据和退出应用时，必须完整停止所有后台任务。

### 修改方案

给 `DocumentManager` 增加：

```ts
class DocumentManager {
  cancelAll(): Promise<void>;
  waitForIdle(): Promise<void>;
  dispose(): Promise<void>;
}
```

建议增加内部状态：

```ts
private acceptingTasks = true;
private idleResolvers: Array<() => void> = [];
```

清除本地数据的正确顺序：

```text
禁止新任务进入
→ 取消交互翻译
→ 取消词典上下文请求
→ 取消局部重译和候选请求
→ 取消文档活动任务
→ 清空文档等待队列
→ 等待所有任务退出
→ 清除本地 Store
→ 重置设置
→ 重新允许任务进入
```

应用退出时也需要：

```ts
await documentManager.dispose();
```

不能只取消 `TranslationManager`。

### 涉及文件

- `electron/main/bootstrap/application.ts`
- `electron/main/document/manager.ts`
- `electron/main/ipc/register.ts`
- `electron/main/storage/documents.ts`

### 测试要求

新增测试：

- 活动任务执行中调用 `cancelAll()`。
- 队列中有多个任务时调用 `cancelAll()`。
- 清除后任务不能重新写回 Store。
- `dispose()` 后不能再启动新任务。
- 退出应用时所有 Controller 均已 abort。

### 验收标准

执行以下流程：

1. 导入一个大文档。
2. 开始翻译。
3. 翻译进行中点击清除所有本地数据。
4. 等待原模型请求结束。
5. 检查用户数据目录。

要求：

- `document-tasks.json` 不得重新出现旧任务。
- 历史记录不得重新写入。
- 应用不能出现未处理 Promise 异常。
- 清除后可以正常开始新的翻译任务。

---

## P0-3：重构模型调用并发调度

### 当前问题

现有 `ModelConcurrencyGate` 设计目标是：

> 交互请求优先于文档后台分块。

但当前实现只能保证：

- 文档任务开始前等待交互任务。
- 文档分块之间等待交互任务。

不能保证：

- 文档分块执行过程中不启动新的交互请求。
- 本地模型同一时刻只执行一个生成任务。
- 交互请求真正抢占文档任务。

当文档分块正在调用 Ollama 时，用户发起划词翻译，两个请求可能同时进入本地模型。

可能导致：

- 首 Token 延迟显著增加。
- 显存占用上升。
- 本地模型推理速度下降。
- 小显存设备出现 OOM。
- 文档任务和交互任务互相阻塞。

### 优化目标

所有模型生成请求进入统一调度器。

交互任务优先于后台文档任务。

### 推荐架构

新增：

```ts
class ModelTaskScheduler
```

任务类型：

```ts
type ModelTaskPriority = "interactive" | "background";
```

建议接口：

```ts
interface ModelTaskContext {
  signal: AbortSignal;
}

class ModelTaskScheduler {
  runInteractive<T>(
    task: (context: ModelTaskContext) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T>;

  runBackground<T>(
    task: (context: ModelTaskContext) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T>;

  cancelBackground(): void;
  waitForIdle(): Promise<void>;
}
```

### 推荐调度策略

本地模型默认单通道：

```text
处理一个文档分块
→ 释放模型租约
→ 检查交互队列
→ 先处理交互请求
→ 再处理下一个文档分块
```

不要让文档任务一次性持有整个任务期间的模型锁。

### 可选抢占策略

交互请求到来时：

1. Abort 当前文档分块。
2. 当前分块保持未完成状态。
3. 先运行交互请求。
4. 交互结束后重新翻译该分块。

第一阶段可以不做分块中途抢占，但必须保证：

- 同一时刻只有一个模型生成请求。
- 文档只在分块边界让出。
- 新交互请求排在下一个文档分块之前。

### 涉及文件

- `electron/main/core/model-concurrency-gate.ts`
- `electron/main/translation/manager.ts`
- `electron/main/document/manager.ts`
- `electron/main/provider/*`
- 对应单元测试

### 测试要求

至少覆盖：

1. 交互任务运行时，文档任务等待。
2. 文档分块完成后，交互任务优先于下一个分块。
3. 多个交互任务按顺序执行。
4. 文档任务取消后释放调度资源。
5. 任意任务异常时调度器不会死锁。
6. Abort 等待中的任务不会残留 waiter。
7. 同一时间最多只有一个 Provider 生成调用。

### 验收标准

运行大文档翻译时触发划词翻译：

- 划词请求应在当前文档分块结束后立即执行。
- 不得与下一个文档分块并发。
- 文档任务在交互请求结束后继续。
- 调度器无死锁。
- 应用退出后没有遗留等待任务。

---

## P0-4：隔离翻译结果与历史保存异常

### 当前问题

当前翻译主流程中：

1. 模型翻译成功。
2. 向 Renderer 发送成功事件。
3. 写入历史记录。
4. 历史记录写入失败。
5. 外层 `catch` 捕获异常。
6. 再向 Renderer 发送错误事件。

结果是：

- 翻译已经成功。
- 仅仅因为历史文件写入失败，UI 可能被改成翻译失败。

### 优化目标

历史记录属于附属持久化功能。

历史保存失败不能覆盖翻译结果。

### 修改方案

将主流程拆分为：

```ts
this.emit(sender, {
  requestId,
  status: "success",
  content: displayText,
  result
});

try {
  await this.historyStore.add(historyItem, settings.history);
} catch (error) {
  recordNonFatalError("history-write-failed", error);
}
```

可选增加非阻断事件：

```ts
{
  type: "warning",
  code: "history-write-failed",
  message: "翻译成功，但历史记录保存失败。"
}
```

### 涉及文件

- `electron/main/translation/manager.ts`
- `electron/main/storage/history.ts`
- `electron/shared/types.ts`
- `src/composables/useTranslation.ts`
- UI 提示组件

### 测试要求

模拟以下异常：

- 历史文件无写权限。
- 临时文件写入失败。
- rename 失败。
- JsonStore write 抛出异常。

预期：

- 翻译事件仍为 success。
- 结果仍可复制。
- UI 只显示非阻断提示。
- 不发送第二个 error 覆盖成功状态。

---

# 4. P1：重要功能体验优化

## P1-1：实现普通翻译的真实流式展示

### 当前问题

Provider 使用流式接口，但普通翻译和技术翻译要求模型返回完整 JSON。

TranslationManager 会收集完整输出后再：

- 解析 JSON。
- 校验 Segment。
- 必要时发起一次修复请求。
- 最后一次性发送结果。

因此普通翻译在 UI 中不是真正的流式展示。

### 优化目标

长文本翻译过程中尽快显示第一批译文。

### 推荐方案一：NDJSON

模型逐行输出：

```json
{"id":"segment-1","target":"第一句译文"}
{"id":"segment-2","target":"第二句译文"}
```

Parser 收到完整一行后：

1. 校验 ID。
2. 更新对应 Segment。
3. 向 Renderer 发送 segment 事件。
4. 最终检查是否缺少 Segment。

建议新增事件：

```ts
interface TranslationSegmentEvent {
  requestId: string;
  status: "segment";
  segment: TranslationSegment;
}
```

### 推荐方案二：分批翻译

如果小模型对 NDJSON 稳定性较差，可以将句段分批：

- 每批 1 至 3 个 Segment。
- 每批完成后立即刷新。
- 最后统一组装结果。

该方案调用次数更多，但对 8B、9B 模型通常更可靠。

### 回退策略

结构化输出失败时：

- 不要重新修复整份长文本。
- 只补译缺失或非法的 Segment。
- 已成功的 Segment 保留。

### 验收标准

对于 20 段左右的文本：

- 用户应在完整任务结束前看到部分译文。
- 已显示 Segment 不因后续错误而消失。
- 单个 Segment 修复失败不影响其他 Segment。
- 点击停止后不再继续追加结果。

---

## P1-2：所有增强能力继承当前 Profile

### 当前问题

以下能力目前主要使用默认普通 Prompt：

- 局部重译。
- 候选译法。
- 词典上下文解释。

这会造成：

- 学术翻译后局部重译变成普通语体。
- 技术翻译后候选译法不再保留技术风格。
- 代码注释 Profile 的重译可能破坏代码约束。

### 优化目标

增强能力使用与原翻译相同的 Policy。

### 修改方案

`ResolvedTranslationPolicy` 必须传递给：

- `buildRevisionPrompt`
- `buildAlternativesPrompt`
- `buildDictionaryContextPrompt`
- 文档翻译
- 结构化修复请求

建议请求中只传 `profileId`，由主进程重新解析 Profile。

不要由 Renderer 直接传完整 systemPrompt 作为可信配置。

### 验收标准

测试以下场景：

- technical Profile 局部重译保持技术语体。
- academic Profile 候选译法保持正式语体。
- code-comment Profile 不修改代码。
- allowRemote=false 时所有增强请求均禁止远程发送。
- Profile 指定模型时，增强请求使用相同模型。

---

## P1-3：增加 Translation Session 持久化

### 当前问题

当前局部重译和候选译法通过页面内的 `revisions` 数组覆盖显示结果。

这些修改只存在于 Vue 内存：

- 页面刷新后丢失。
- 切换页面后可能丢失。
- 关闭应用后丢失。
- 历史记录仍保存首次模型结果。

### 优化目标

将一次翻译过程保存为可恢复的 Session。

### 推荐数据结构

```ts
interface TranslationSession {
  schemaVersion: 1;
  id: string;

  originalSourceText: string;
  normalizedSourceText: string;

  profileId: string;
  sourceLanguage: LanguageCode;
  targetLanguage: TargetLanguage;

  originalResult: TranslationResult;
  revisions: SegmentRevision[];

  finalResultText: string;

  provider: string;
  model: string;
  promptVersion: string;

  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
}
```

### 建议行为

- 初次翻译成功：创建 Session。
- 局部重译成功：追加 Revision，并更新 `finalResultText`。
- 选择候选译法：追加 Revision。
- 撤销 Revision：更新 Session。
- 历史详情页：显示最终结果。
- 可选显示“查看初始译文”。

### 兼容策略

现有 `history.json` 数据迁移为 Session：

- 旧 `sourceText` → `originalSourceText` 和 `normalizedSourceText`。
- 旧 `resultText` → `originalResult` 的回退文本和 `finalResultText`。
- `revisions` 默认为空数组。

### 验收标准

执行流程：

1. 翻译文本。
2. 修改其中一个句段。
3. 关闭应用。
4. 重新打开。
5. 从历史中查看。

要求最终结果和 Revision 仍存在。

---

## P1-4：保留原始文本与清理后文本

### 当前问题

`autoCleanText` 默认开启。

清理后文本直接替换请求文本，并被用于：

- 翻译。
- TranslationResult。
- HistoryStore。

用户原始输入没有被保留。

### 优化目标

文本清理必须可追溯、可撤销。

### 修改方案

将输入模型调整为：

```ts
interface PreparedTranslationInput {
  originalText: string;
  normalizedText: string;
  cleanupActions: CleanupAction[];
}
```

示例：

```ts
interface CleanupAction {
  type:
    | "normalize-line-breaks"
    | "remove-soft-wraps"
    | "normalize-spaces"
    | "protect-code-block";
  description: string;
}
```

### UI 建议

发生清理时，在原文区域显示：

```text
已自动整理网页换行
查看原文
撤销整理
```

用户点击“撤销整理”后使用原始文本重新翻译。

### 验收标准

- History 中可以读取原始文本。
- 可以查看清理后文本。
- 清理失败时使用原始文本。
- 不得因清理导致代码块、路径、URL 或 Markdown 被破坏。

---

# 5. P2：代码结构与基础设施优化

## P2-1：拆分 TranslationPage.vue

### 当前问题

`TranslationPage.vue` 同时负责：

- 翻译。
- Profile。
- 句段联动。
- 局部重译。
- 候选译法。
- 词典。
- 词典上下文。
- 术语表。
- OCR。
- 质量检查。
- 复制。
- Session 状态。

页面已经成为大型业务控制器。

### 优化目标

页面只负责编排，业务状态下沉到 Composable 和组件。

### 推荐目录

```text
src/
├─ composables/
│  ├─ useTranslationWorkspace.ts
│  ├─ useSegmentInteraction.ts
│  ├─ useSegmentRevision.ts
│  ├─ useDictionaryPanel.ts
│  ├─ useOcrCapture.ts
│  ├─ useGlossaryActions.ts
│  └─ useTranslationSession.ts
│
├─ components/
│  ├─ translation/
│  │  ├─ TranslationSourcePanel.vue
│  │  ├─ TranslationResultPanel.vue
│  │  ├─ TranslationToolbar.vue
│  │  ├─ SegmentRevisionPopover.vue
│  │  └─ QualityIssuePanel.vue
│  │
│  ├─ dictionary/
│  │  ├─ DictionaryPanel.vue
│  │  └─ DictionaryContextPanel.vue
│  │
│  └─ ocr/
│     └─ OcrPreviewPanel.vue
│
└─ pages/
   └─ TranslationPage.vue
```

### 拆分要求

`TranslationPage.vue` 最终只保留：

- 页面级布局。
- 主要组件组合。
- 少量跨模块事件协调。

不应继续直接维护几十个业务 `ref`。

### 注意事项

- 拆分过程不要改变 IPC 协议。
- 每拆出一个 Composable，补对应测试。
- 监听器必须在 `onUnmounted` 时释放。
- AbortController 和 requestId 状态必须集中管理。

---

## P2-2：JsonStore 增加串行写入队列

### 当前问题

当前 JsonStore 使用固定临时路径：

```text
file.json.tmp
```

同时发生多个写入时可能出现：

- 两次写入覆盖同一临时文件。
- rename 顺序混乱。
- 某次 rename 后另一次找不到临时文件。
- 内存状态与磁盘状态不一致。

### 优化目标

同一 Store 的写入必须串行执行。

### 修改方案

建议实现：

```ts
export class JsonStore<T> {
  private writeChain: Promise<void> = Promise.resolve();

  write(value: T): Promise<void> {
    const snapshot = structuredClone(value);

    const next = this.writeChain.then(
      () => this.writeInternal(snapshot),
      () => this.writeInternal(snapshot)
    );

    this.writeChain = next.catch(() => undefined);
    return next;
  }

  private async writeInternal(value: T): Promise<void> {
    // write + fsync + rename
  }
}
```

临时文件使用随机后缀：

```ts
const temporaryPath =
  `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
```

### 可选增强

- 写入前创建备份。
- JSON 损坏时尝试读取 `.bak`。
- Windows rename 失败时短暂重试。
- 写入完成后 fsync。
- 诊断中记录非敏感存储异常。

### 测试要求

并发执行：

- History add。
- Toggle favorite。
- Delete。
- Settings update。
- Document progress update。

要求最终 JSON 合法且内容不丢失。

---

## P2-3：增强 IPC 和窗口安全

### 当前状态

项目已经启用：

- `contextIsolation: true`
- `nodeIntegration: false`
- 生产环境 sandbox
- preload 白名单

基础方向正确。

### 建议补充

#### 1. IPC Sender 校验

新增：

```ts
function assertTrustedSender(event: IpcMainInvokeEvent): void
```

校验：

- `event.senderFrame.url`
- 是否来自当前应用 Renderer
- 是否为主 Frame

敏感 IPC 必须调用：

- 设置写入。
- 数据清除。
- 文件导入导出。
- Profile 更新。
- Glossary 更新。
- Clipboard 写入。

#### 2. 禁止未知页面导航

新增：

```ts
function configureNavigationSecurity(window: BrowserWindow): void
```

处理：

```ts
window.webContents.on("will-navigate", ...)
window.webContents.setWindowOpenHandler(...)
```

默认拒绝应用内任意外部导航。

合法外部链接统一使用：

```ts
shell.openExternal(url)
```

并限制协议为：

- `https:`
- 必要时 `mailto:`

#### 3. IPC 运行时参数校验

当前 TypeScript 类型不能防止恶意或异常 Renderer 传入错误数据。

建议对以下数据使用运行时 schema：

- TranslationRequest
- Settings
- Profile
- GlossaryEntry
- Document 请求
- OCR 请求
- Clipboard 文本

可以使用轻量手写校验，暂时不一定引入 Zod。

---

# 6. 交互体验优化

## 6.1 简化翻译页 Header

### 当前问题

Header 同时包含：

- 普通/技术模式。
- 目标语言。
- Profile。
- OCR 屏幕。
- OCR 按钮。
- 质量检查。
- Provider 状态。

控制项过多，层级不清楚。

### 建议布局

Header：

- 源语言和目标语言。
- 当前 Profile。
- Provider 状态。

原文面板工具栏：

- OCR。
- 粘贴。
- 清空。
- 文本清理状态。

译文面板工具栏：

- 质量检查。
- 复制译文。
- 复制双语。
- 停止或重试。

Profile 快捷入口：

- 通用。
- 技术。
- 学术。
- 更多。

---

## 6.2 优化快捷键语义

### 当前问题

当前“翻译快捷键”实际固定触发技术翻译。

这会导致：

- 设置名称与实际行为不一致。
- 普通用户无法设置默认通用翻译。
- Profile 系统不能充分发挥作用。

### 修改方案

设置中新增：

```ts
interface ShortcutSettings {
  translation: string;
  naming: string;
  screenshot: string;
  paused: boolean;
  defaultTranslationProfileId: string;
}
```

快捷翻译行为：

```text
读取 defaultTranslationProfileId
→ 使用该 Profile
→ 打开悬浮窗翻译
```

### 验收标准

用户可以指定：

- 通用翻译。
- 技术翻译。
- 学术翻译。
- 自定义 Profile。

作为快捷翻译默认场景。

---

## 6.3 悬浮窗尺寸和状态优化

### 当前问题

悬浮窗使用固定初始尺寸和最大高度。

词典、长文本和句段结果容易拥挤。

### 修改方案

- 根据内容类型动态调整高度。
- 最大高度根据当前显示器工作区计算。
- 记忆用户手动调整的窗口尺寸。
- 切换到词典时使用紧凑高度。
- 长文本翻译时允许更高窗口。
- 多屏幕情况下按当前屏幕限制位置和尺寸。

建议设置结构：

```ts
window: {
  closeAction: "hide",
  autoHidePopup: true,
  popupBounds?: {
    width: number;
    height: number;
  }
}
```

---

## 6.4 优化词典查询能力

### 当前能力

当前查词顺序：

1. 精确匹配。
2. 规范化匹配。
3. 词形还原。
4. Strip key 模糊匹配。

### 后续建议

按优先级逐步增加：

1. 拼写建议。
2. 前缀查询。
3. 按 BNC / FRQ 词频排序。
4. 常用短语优先。
5. 点击词形跳转。
6. 词典历史。
7. 生词收藏。
8. 发音播放。

第一阶段不建议接入复杂在线词典服务。

保持本地词典优先，在线功能作为可选增强。

---

# 7. 测试与质量要求

## 7.1 单元测试

必须新增或补充以下测试。

### Profile 和 Prompt

- Profile 优先级。
- Profile 模型路由。
- Profile 禁止远程。
- 增强能力继承 Profile。
- Naming 不受翻译 Profile 干扰。

### Scheduler

- 交互任务优先。
- 文档任务按分块释放。
- Abort 等待任务。
- 异常后释放锁。
- 同时最多一个模型生成请求。

### DocumentManager

- cancelAll。
- dispose。
- waitForIdle。
- 队列清空。
- 清除数据后不回写。

### Storage

- JsonStore 并发写入。
- rename 失败。
- 临时文件清理。
- 历史写入失败不影响翻译。

### Session

- Revision 持久化。
- 撤销持久化。
- 旧 History 数据迁移。
- 重启恢复最终结果。

### Streaming

- Segment 增量事件。
- 过期 requestId 丢弃。
- 停止后不继续追加。
- 部分 Segment 失败时保留成功结果。

---

## 7.2 E2E 测试

至少覆盖以下流程。

### 基础翻译

```text
启动应用
→ 输入文本
→ 选择 Profile
→ 翻译
→ 验证结果
```

### 局部重译持久化

```text
翻译
→ 选择句段
→ 局部重译
→ 关闭应用
→ 重新打开
→ 从历史恢复
```

### 文档与交互优先级

```text
开始文档翻译
→ 触发划词翻译
→ 验证划词先完成
→ 文档继续执行
```

### 清除数据

```text
开始文档任务
→ 清除本地数据
→ 等待模型请求结束
→ 验证任务未重新写回
```

### 历史写入失败

```text
让历史目录不可写
→ 执行翻译
→ 验证翻译成功
→ 验证出现非阻断提示
```

---

## 7.3 构建验证

每个阶段完成后必须运行：

```bash
pnpm test
pnpm build
pnpm test:e2e
```

Windows 环境下补充：

```bash
pnpm dist:win
pnpm dist:win:portable
```

如本地有 Ollama：

```powershell
$env:LEXIFLOW_E2E_MODEL="qwen3.5:9b"
pnpm exec playwright test
```

---

# 8. 推荐实施顺序

## 第一阶段：正确性与生命周期

必须先完成：

1. Mode 与 Profile 统一。
2. 历史保存异常隔离。
3. DocumentManager 增加 cancelAll、waitForIdle 和 dispose。
4. 清除数据流程修复。
5. 应用退出流程修复。
6. 补对应单元测试和 E2E。

完成后运行：

```bash
pnpm test
pnpm build
pnpm test:e2e
```

---

## 第二阶段：模型调度与结果一致性

继续完成：

1. 将 ModelConcurrencyGate 重构为 ModelTaskScheduler。
2. 文档分块按单个 Chunk 获取模型资源。
3. 保证同一时刻只有一个模型生成请求。
4. 所有增强功能继承 Profile。
5. 增加调度器测试。

---

## 第三阶段：Session 与流式体验

继续完成：

1. TranslationSession 数据结构。
2. History 数据迁移。
3. Revision 和候选结果持久化。
4. 保存原始文本和清理后文本。
5. 实现句段增量输出。
6. 增加 Session 和 Streaming 测试。

---

## 第四阶段：前端重构与安全

最后完成：

1. 拆分 TranslationPage。
2. 简化页面 Header。
3. 优化悬浮窗。
4. JsonStore 串行写入。
5. IPC Sender 校验。
6. 禁止未知页面导航。
7. 补充发布回归测试。

---

# 9. Coding Agent 执行要求

Agent 在执行时必须遵守以下要求：

1. 先阅读当前代码，不要仅根据本文直接重写。
2. 每次只处理一个明确问题。
3. 避免同时进行无关格式化。
4. 保持改动范围最小。
5. 不删除现有功能。
6. 修改共享类型时同步检查：
   - Main Process
   - Preload
   - Renderer
   - IPC_CHANNELS
   - API 类型
   - 测试
7. 修改 Prompt 或结构化输出规则时同步更新：
   - Prompt
   - Schema 校验
   - Parser
   - UI
   - 测试
   - `PROMPT_VERSION`
8. 修改本地 JSON 结构时必须：
   - 增加 schemaVersion。
   - 编写迁移逻辑。
   - 保留旧数据兼容。
   - 更新清除数据逻辑。
9. 每完成一个任务，运行相关测试。
10. 不要在测试未通过时继续大规模修改。

---

# 10. 最终完成标准

本轮优化完成后，项目应满足以下要求：

- UI 中选择的 Profile 与实际 Prompt 一致。
- 普通、技术、学术和自定义翻译行为明确。
- 局部重译和候选译法继承当前 Profile。
- 清除数据后后台任务不会重新写回。
- 应用退出时所有后台任务正常释放。
- 文档翻译不会与交互翻译并发占用本地模型。
- 交互翻译优先于后台文档任务。
- 历史记录失败不会导致翻译失败。
- 局部修改可以持久化和恢复。
- 原始文本和清理后文本均可追溯。
- 长文本翻译能够逐步显示结果。
- JsonStore 不存在并发写入竞争。
- TranslationPage 职责清晰。
- IPC 和窗口导航边界更加严格。
- `pnpm test`、`pnpm build`、`pnpm test:e2e` 全部通过。
- Windows 安装包和 Portable 版本可以正常运行。
