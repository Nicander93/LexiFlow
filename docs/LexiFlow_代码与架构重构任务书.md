# LexiFlow 代码与架构重构任务书

> 适用仓库：`Nicander93/LexiFlow`  
> 审查基线：`main`，提交 `fdd6938c52e85c53526ba96022e1cbe5d035f72f`  
> 文档用途：交给 Coding Agent 分阶段完成代码重构  
> 审查方式：基于当前仓库静态代码审查；本轮未在本地独立执行 `pnpm test`、`pnpm build` 与 Windows 手工回归

---

## 1. 重构结论

LexiFlow 当前并非“完全没有架构”。仓库已经按 Electron 主进程、preload、共享契约、Vue 页面和 features 做了初步划分，也已具备模型访问校验、任务调度、Store、Profile、词典、OCR、文档任务等模块。

当前真正的问题是：

1. **目录已经分层，但职责边界仍然集中在少数大型编排文件中。**
2. **主进程、preload、Renderer 之间的协议依赖手工同步，容易漂移。**
3. **设置、翻译 Session、窗口导航和 OCR 通过完整对象、全局事件或临时存储传递，缺少明确的应用状态边界。**
4. **交互翻译与文档翻译重复实现模型调用管线，行为会逐渐分叉。**
5. **部分代码存在实际正确性和性能风险，不能只做目录移动。**

本次重构应采取“小步替换”策略，不进行一次性重写，也不引入重量级框架。目标是让每个模块有单一职责、关键用例可独立测试、IPC 边界可验证、Renderer 状态可预测。

---

## 2. 当前架构概览

```text
Electron Main
├─ bootstrap/application.ts       应用装配、运行时设置、生命周期
├─ ipc/register.ts                全部 IPC handler
├─ translation/manager.ts         翻译、修订、候选、词典解释
├─ document/manager.ts            导入、解析、队列、翻译、导出
├─ window/manager.ts              主窗、弹窗、划词提示窗
├─ provider/*                     Ollama / OpenAI-compatible
├─ storage/*                      设置、历史、Profile、术语、文档任务
├─ ocr/windows-ocr.ts             截图和 Windows OCR
└─ core/*                         校验、策略、Prompt、调度、解析

Electron Boundary
├─ shared/types.ts                所有领域类型和 IPC 通道
├─ shared/api.ts                  Renderer API 总契约
└─ preload/index.ts               手写 IPC 转发

Vue Renderer
├─ pages/TranslationPage.vue      翻译工作区总编排
├─ pages/PopupPage.vue            快速翻译弹窗总编排
├─ pages/SettingsPage.vue         设置分类编排
├─ features/*                     部分功能组件与 composable
├─ platform/translator.ts         preload 获取 + 浏览器预览完整桩
└─ window CustomEvent / sessionStorage
                                 跨组件、跨页面命令传递
```

### 当前结构的主要矛盾

- `core/` 中已有不少纯逻辑，但真正的业务用例仍聚合在 Manager。
- `features/` 中已有 UI 拆分，但页面仍持有过多状态和流程。
- `shared/` 既承担 IPC DTO，又承担业务模型、持久化模型和 UI 状态，边界过宽。
- `TranslatorApi` 看似类型安全，但运行时输入并未统一验证。

---

## 3. 缺陷优先级总表

| ID | 优先级 | 问题 | 主要影响 |
|---|---|---|---|
| WIN-001 | P0 | 流式输出反复触发弹窗自适应缩放和设置写入 | UI 抖动、磁盘写入、配置竞态 |
| SET-001 | P0 | 多入口以完整 `AppSettings` 快照保存 | 无关配置被旧快照覆盖 |
| NAV-001 | P0 | 打开根路由时已有主窗口不会导航 | 历史“打开会话”可能失效 |
| OCR-001 | P0 | 先整屏降采样 OCR，再按框筛选文本块 | 清晰度差、选择不准确、性能浪费 |
| IPC-001 | P0 | IPC 可信来源校验与运行时参数校验不一致 | 边界不可靠、异常输入可进入业务层 |
| TRN-001 | P1 | 翻译和文档分块使用两套模型管线 | 行为、解析、错误处理逐渐分叉 |
| TRN-002 | P1 | 所有交互模型任务共用一个 `activeRequest` | 不相关任务相互取消 |
| TRN-003 | P1 | 主进程和 Renderer 重复聚合流式状态 | Session 与 UI 结果可能漂移 |
| ARC-001 | P1 | `TranslationManager`、`DocumentManager`、IPC 注册文件职责过多 | 难测试、难扩展、改动影响面大 |
| RDR-001 | P1 | `TranslationPage.vue` 成为 God Component | 状态耦合、回归风险高 |
| RDR-002 | P1 | `CustomEvent`、`sessionStorage` 充当应用命令总线 | 隐式依赖、类型弱、时序脆弱 |
| CON-001 | P1 | IPC 契约需在五处手工同步 | 通道、类型和预览桩容易不一致 |
| STO-001 | P1 | JSON 读取异常统一回退默认值 | 文件损坏看起来像数据丢失 |
| WIN-002 | P2 | `WindowManager` 同时承担三类窗口全部策略 | 窗口行为继续增长后难维护 |
| SET-002 | P2 | 设置子组件直接修改父级完整对象 | 单向数据流不清晰、局部保存困难 |
| QLT-001 | P2 | 缺少 lint、格式化和架构边界检查 | 大文件、越层依赖持续累积 |
| UX-001 | P2 | 主窗口与弹窗复制交互不一致；需清理质量检查遗留 | 交互和代码残留不统一 |

---

# 4. 详细问题与修改要求

## 4.1 WIN-001：弹窗自适应高度形成设置写入风暴

### 现状

`src/pages/PopupPage.vue` 监听：

```ts
watch([status, displayResult, sourceExpanded, popupView], () => adaptHeightForView(popupView.value));
```

流式翻译期间，`displayResult` 会持续变化，每次变化都会调用：

```ts
translator.window.adaptPopupHeight(...)
```

主进程 `WindowManager.adaptPopupHeight()` 调用 `BrowserWindow.setSize()`。同时 `ensurePopupWindow()` 监听窗口 `resized`，并调用 `savePopupBounds()`；该回调又读取完整设置并执行 `settingsStore.update(settings)`。

形成以下链路：

```text
模型流式 chunk
→ displayResult 改变
→ Renderer 请求调整高度
→ BrowserWindow.setSize
→ resized
→ 保存 popupBounds
→ 写入完整 settings.json
```

### 风险

- 流式输出期间产生大量不必要的磁盘写入。
- 弹窗高度可能随每个 chunk 抖动。
- 自动计算尺寸被当成用户手动尺寸持久化。
- 与设置页或侧栏同时保存时，可能触发 SET-001 的覆盖竞态。

### 重构要求

1. 区分两种尺寸变化：
   - `programmatic resize`：程序自动调整，不持久化。
   - `user resize`：用户拖动窗口，才持久化。
2. `WindowManager` 增加内部标记：

```ts
private adaptingPopup = false;
```

3. 调用 `setSize()` 前设置标记，并在 resize 完成后释放；`resized` 回调检测该标记。
4. Renderer 不再监听完整 `displayResult` 文本；使用以下任一方案：
   - `ResizeObserver` 观察内容容器，150ms 防抖；
   - 仅在视图类型、加载状态、结构化段落数量发生变化时调整。
5. 用户尺寸持久化增加 300ms 防抖。
6. 增加测试，证明 100 个流式事件不会产生 100 次设置写入。

### 验收标准

- 一次长文本流式翻译期间，设置持久化次数为 0。
- 用户手动拖动弹窗后，最终尺寸只保存一次。
- 自动适配仍能在词典、命名、翻译视图间正确切换。

---

## 4.2 SET-001：完整设置快照保存导致并发覆盖

### 现状

当前多个入口都执行完整对象更新：

- 设置页：`useSettingsForm.saveCurrent()`。
- 侧栏划词开关：`AppSidebar.toggleSelection()`。
- 弹窗尺寸：`bootstrap/application.ts` 中 `savePopupBounds` 回调。
- 托盘暂停快捷键：复制旧设置、修改后整体保存。

`SettingsStore.update(next: AppSettings)` 没有版本号、字段 patch 或冲突检测。

### 典型竞态

```text
A：设置页读取 settings v1
B：弹窗读取 settings v1
A：修改 Provider，保存完整 v2
B：修改 popupBounds，稍后保存基于 v1 的完整对象
结果：Provider 被恢复为旧值
```

即使写入链串行，也只能保证文件写入顺序，不能保证快照语义正确。

### 重构要求

引入主进程唯一的 `SettingsService`，所有修改使用命令或 patch：

```ts
interface SettingsSnapshot {
  revision: number;
  settings: AppSettings;
}

type SettingsPatch =
  | { type: "update-general"; value: Partial<GeneralSettings> }
  | { type: "update-shortcuts"; value: Partial<ShortcutSettings> }
  | { type: "update-provider"; value: ProviderSettingsInput }
  | { type: "update-window"; value: Partial<WindowSettings> }
  | { type: "reset" };
```

建议 API：

```ts
class SettingsService {
  getSnapshot(): SettingsSnapshot;
  update(command: SettingsCommand): Promise<SettingsSnapshot>;
}
```

要求：

1. 所有修改必须在主进程读取“最新值”后合并。
2. API Key 继续只在主进程处理，Renderer 不回传掩码。
3. 快捷键事务只在快捷键相关字段变化时执行。
4. 历史 prune 只在历史设置变化时执行。
5. 窗口尺寸更新不得触发 Provider、快捷键等运行时重新应用。
6. 保留兼容期：旧 `settings.update(fullSettings)` 可暂时由适配层转成 patch，但最终删除。

### 验收标准

- 并发更新 Provider 与 popupBounds，最终两项都保留。
- 修改字体不重新注册快捷键。
- 修改历史上限只执行 history prune。
- 保存失败时只回滚本次命令涉及的运行时状态。

---

## 4.3 NAV-001：已有主窗口时根路由导航失效

### 现状

`HistoryPage.retranslate()`：

```ts
sessionStorage.setItem("lexiflow:retranslate", JSON.stringify(item));
translator.window.openMain("/");
```

`WindowManager.showMainWindow()`：

```ts
if (route !== "/") window.webContents.send("navigation:open", route);
```

当主窗口已经存在并停留在 `/history` 时，调用 `openMain("/")` 不会发送导航事件。因此窗口可能仍停留在历史页，`TranslationPage` 也不会重新挂载并读取 `sessionStorage`。

### 重构要求

短期修复：

```ts
async showMainWindow(route?: string): Promise<void> {
  const window = await this.createMainWindow();
  if (route) window.webContents.send(IPC_CHANNELS.navigationOpen, route);
  // ...
}
```

长期方案：删除 `sessionStorage` 传完整历史对象，新增明确用例：

```ts
translator.translation.openHistorySession(historyId)
```

主进程根据 `historyId` 读取记录、建立 `TranslationSession`，然后通知主窗口打开翻译页。

### 验收标准

以下情况都能打开翻译页并恢复会话：

- 主窗口尚未创建。
- 主窗口在历史页。
- 主窗口在设置页。
- 主窗口最小化或隐藏。

---

## 4.4 OCR-001：OCR 处理顺序和坐标模型不合理

### 现状

主进程 `WindowsOcrService`：

1. `desktopCapturer` 以固定 `1920 × 1080` 缩略图抓取整屏。
2. 将整屏缩略图写为临时 PNG。
3. PowerShell 对整屏执行 OCR。
4. 返回整屏文本与行级 blocks。

Renderer `useOcrCapture()` 中的框选只是：

- 在已经识别出的 blocks 中，按文本块中心点是否落入选框进行筛选。
- 不会对选区裁剪图像后重新 OCR。

### 具体缺陷

1. 2K、4K、高 DPI 屏幕先降到 1080p，细小字体识别率下降。
2. 用户只需要一个小区域，却先对整屏 OCR，延迟和资源浪费明显。
3. 选框跨过文本块边缘时，只按中心点判断，容易漏选。
4. PowerShell 中行框宽度为单词宽度求和，没有考虑词间距，几何框可能偏小。
5. OCR 调用没有显式超时和取消能力。
6. PowerShell/语言包错误没有结构化错误码，UI 只能展示通用字符串。

### 目标流程

```text
列出屏幕
→ 以接近物理像素的尺寸捕获屏幕
→ Renderer 展示截图并让用户框选
→ 将归一化选区传回主进程
→ 主进程裁剪图像
→ 仅对裁剪区域执行 OCR
→ 返回区域文本、局部 blocks 和坐标映射
```

### 建议接口

```ts
interface CaptureScreenResult {
  captureId: string;
  imageDataUrl: string;
  pixelWidth: number;
  pixelHeight: number;
  scaleFactor: number;
}

interface RecognizeRegionRequest {
  captureId: string;
  region: { x: number; y: number; width: number; height: number };
}
```

不要让 Renderer 回传任意本地文件路径。主进程维护短期 `captureId → image buffer` 缓存，并在识别、取消或超时后清理。

### 实施要求

1. 拆分：
   - `ScreenCaptureService`
   - `ImageCropper`
   - `WindowsOcrEngine`
   - `OcrUseCase`
2. 使用已有 `@napi-rs/canvas` 做内存裁剪，避免临时整屏文件。
3. OCR 临时文件仅保存裁剪后的小区域；在 `finally` 删除。
4. 增加 15–30 秒超时和 `AbortSignal`。
5. 定义错误码：
   - `OCR_UNSUPPORTED_PLATFORM`
   - `OCR_LANGUAGE_PACK_MISSING`
   - `OCR_CAPTURE_FAILED`
   - `OCR_EMPTY_REGION`
   - `OCR_TIMEOUT`
   - `OCR_ENGINE_FAILED`
6. 多屏、高 DPI 坐标换算必须使用归一化比例与实际捕获像素，不直接混用 DIP 和物理像素。

### 验收标准

- 4K 屏幕的小字体选区清晰度不低于原始捕获。
- OCR 只识别选区，不识别整屏。
- 取消后 PowerShell 子进程终止，临时文件清除。
- 选区越界、过小、空白时给出明确提示。

---

## 4.5 IPC-001：IPC 边界校验不一致

### 现状

`ipc/register.ts` 中只有部分 handler 使用 `withTrustedSender()`。部分查询、模型调用、窗口操作和事件 handler 没有统一来源校验。

同时，大部分请求只依赖 TypeScript 类型，没有运行时 schema。当前只有词典查询做了少量手工检查。

### 问题

- TypeScript 不能保护 IPC 运行时边界。
- 渲染进程异常、旧版本 preload 或恶意页面可能发送错误形状数据。
- 字符串长度、ID、枚举和对象深度缺少统一限制。
- 一个大型注册文件让安全策略难以审计。

### 重构要求

按领域拆分注册器：

```text
electron/main/interfaces/ipc/
├─ register-runtime-ipc.ts
├─ register-settings-ipc.ts
├─ register-translation-ipc.ts
├─ register-history-ipc.ts
├─ register-dictionary-ipc.ts
├─ register-document-ipc.ts
├─ register-ocr-ipc.ts
├─ register-window-ipc.ts
└─ register-all.ts
```

引入轻量 schema 校验。可选择：

- 自己实现小型断言函数；或
- 引入 `zod`，但只用于 IPC DTO，不把业务层绑死在 zod 上。

统一包装：

```ts
registerInvoke(channel, schema, handler, {
  trustedSender: true,
  mapError: true
});
```

每个 IPC handler 只做：

```text
来源校验
→ DTO 解析
→ 调用 application use case
→ 返回 DTO
```

不得在 IPC 文件中直接：

- 拼接业务逻辑；
- 创建 Provider；
- 读写文件；
- 操作复杂 Store；
- 注册应用退出生命周期。

### 验收标准

- 所有变更型和系统能力 IPC 统一校验可信 sender。
- 所有外部输入有运行时 schema。
- 超长文本、非法枚举、空 ID、畸形对象有一致错误响应。
- `ipc/register.ts` 被替换为只负责组合的 `register-all.ts`。

---

## 4.6 TRN-001：翻译管线重复实现

### 现状

`TranslationManager` 负责交互翻译，包含：

- 输入清理；
- Profile/Policy 解析；
- 模型访问校验；
- 调度；
- Provider 创建；
- 流式 NDJSON 解析；
- 缺失句段修复；
- 结构化输出修复；
- 结果组装；
- Session 和历史写入。

`DocumentManager` 又独立实现：

- Profile 和模型访问校验；
- Glossary 匹配；
- Provider 创建；
- 翻译请求；
- 结果组装；
- 错误状态。

两者已经存在行为差异，例如文档路径没有完整复用交互翻译的 NDJSON 流式解析、缺失段修复、统一耗时统计和部分清理策略。

### 目标

提取与 UI、Electron、历史持久化无关的共享翻译引擎：

```ts
interface TranslationEngineInput {
  text: string;
  profileId?: string;
  taskType: "translation" | "naming" | "document-chunk";
  targetLanguage: TargetLanguage;
  signal: AbortSignal;
  onProgress?: (event: EngineProgress) => void;
}

interface TranslationEngineOutput {
  sourceText: string;
  originalSourceText: string;
  targetText: string;
  segments: TranslationSegment[];
  cleanupActions: CleanupAction[];
  modelInfo: TranslationModelInfo;
  policy: ResolvedTranslationPolicy;
}
```

### 推荐拆分

```text
electron/main/application/translation/
├─ translate-text.ts
├─ revise-segment.ts
├─ get-alternatives.ts
└─ explain-dictionary-context.ts

electron/main/domain/translation/
├─ translation-engine.ts
├─ translation-policy.ts
├─ stream-reducer.ts
├─ structured-output.ts
├─ segments.ts
└─ ports.ts
```

`TranslationManager` 最终应缩小为请求协调适配器，或被多个 use case 替代。

`DocumentManager` 只管理文档任务，不再直接构造 Provider 请求；每个分块调用同一个 `TranslationEngine`。

### 验收标准

- 交互文本与单个文档分块使用相同核心翻译函数。
- 清理、Profile、术语、模型路由、结构化解析规则一致。
- 文档任务仍在分块边界让出调度权。
- 核心引擎可用 Fake Provider 做纯单元测试，不依赖 Electron。

---

## 4.7 TRN-002：单一 `activeRequest` 让无关任务互相取消

### 现状

`TranslationManager` 使用一个：

```ts
private activeRequest: ActiveRequest | null = null;
```

以下操作全部调用 `beginInteractive()`：

- 主翻译；
- 局部重译；
- 候选译法；
- 词典上下文解释。

每次新操作都会先 `this.cancel()`，因此它们共享一个取消通道。

### 问题

- 请求候选译法可能取消正在进行的词典解释。
- 打开词典上下文可能取消其他句段操作。
- 主窗口和快速弹窗共享 Manager 时，两个窗口操作会相互取消。
- “本地模型单通道”与“业务请求只能有一个”被混为一谈。

### 重构要求

引入 `RequestCoordinator`，按 lane 管理：

```ts
type RequestLane =
  | "main-translation"
  | "popup-translation"
  | "segment-revision"
  | "segment-alternatives"
  | "dictionary-context";
```

```ts
class RequestCoordinator {
  begin(lane: RequestLane, requestId: string): AbortSignal;
  cancel(lane: RequestLane, requestId?: string): void;
  cancelAll(): void;
}
```

模型实际并发仍由 `ModelTaskScheduler` 统一限制，但业务请求生命周期应按 lane 独立。

### 验收标准

- 主窗口翻译不会被弹窗的词典解释错误取消。
- 同一 lane 的新请求取消旧请求。
- 不同 lane 可排队等待模型，而不是直接互相销毁。
- 退出和清理数据时可统一 `cancelAll()`。

---

## 4.8 TRN-003：主进程和 Renderer 重复维护翻译状态

### 现状

主进程 `TranslationManager.emit()` 会把事件合并进 `TranslationSessionStore`。

Renderer `useTranslation()` 又独立执行：

- chunk 文本拼接；
- segment upsert；
- targetText 重新组装；
- success/warning 状态判断；
- requestId 过滤。

### 风险

- 两端 reducer 规则不一致。
- Session 恢复后的结果与实时 UI 不一致。
- warning、取消、延迟事件容易出现边界 bug。
- 新事件字段必须在两端同步修改。

### 重构方案

提取共享纯 reducer：

```ts
function reduceTranslationState(
  state: TranslationState,
  event: TranslationEvent
): TranslationState
```

该 reducer 放在 `electron/shared/translation-state.ts` 或独立 domain 包中，不依赖 Electron/Vue。

主进程 SessionStore 和 Renderer composable 都使用同一 reducer。

更理想的后续方案是主进程只持久化最终 Session，实时 UI 状态由 Renderer 单独维护；但第一阶段先统一 reducer，避免大改。

### 额外修复

`TranslationManager.start()` 当前创建 Session 时将 `source` 固定为 `"main"`。请求应显式传入调用来源：

```ts
type TranslationSurface = "main" | "popup" | "ocr" | "history";
```

Renderer 不得把该值作为安全决策依据，但可以用于 Session 恢复和 UX。

---

## 4.9 ARC-001：大型编排文件职责过多

### 主要热点

#### `bootstrap/application.ts`

同时负责：

- Store 初始化；
- Manager 构造；
- 划词流程；
- 快捷键；
- 托盘；
- 设置应用；
- 清除数据；
- 退出顺序。

#### `ipc/register.ts`

集中所有领域 IPC、安全检查、对话框、文件导入导出和生命周期注册。

#### `TranslationManager`

同时承担 8 类业务职责，约 500 行。

#### `DocumentManager`

同时承担文件 IO、PDF 提取、任务队列、状态机、模型调用、持久化、事件发送和导出。

#### `WindowManager`

同时管理主窗口、快速弹窗、划词提示窗及所有尺寸、定位和生命周期策略。

### 目标原则

不是按“文件长度”机械拆分，而是按“变化原因”拆分：

- 模型规则变化不应修改窗口层。
- OCR 引擎变化不应修改翻译页总逻辑。
- 增加一个 IPC 不应触碰所有领域注册文件。
- 文档导出格式变化不应修改任务调度器。
- 设置某个字段不应重跑全部运行时设置。

### 约束

- 不引入 IoC/DI 容器。
- 使用明确构造函数和小型依赖对象。
- 优先提取纯函数与 Port 接口。
- 不创建只有一行转发、没有明确边界价值的“伪 Service”。

---

## 4.10 RDR-001：TranslationPage 是 Renderer God Component

### 现状

`TranslationPage.vue` 同时维护：

- 原文、模式、语言、Profile；
- 翻译状态与 Session 恢复；
- 自动词典查询；
- 句段 hover/lock；
- 局部重译和候选；
- 词典上下文模型请求；
- OCR 截图、框选、编辑；
- 加入术语表；
- 复制；
- 历史重开；
- 多组 watcher 和生命周期监听；
- 巨大的页面模板。

### 重构目标

页面只负责布局和子模块组合：

```text
TranslationPage.vue
├─ TranslationToolbar.vue
├─ SourceEditor.vue
├─ OcrWorkspace.vue
├─ TranslationResult.vue
├─ DictionaryDrawer.vue
└─ SegmentActionPopover.vue
```

建议 composable：

```text
useTranslationWorkspace.ts     页面级协调，保持精简
useTranslationRequest.ts       发起、取消、重试
useTranslationSession.ts       恢复和保存 Session
useDictionaryLookup.ts         自动查词和句段查词
useSegmentActions.ts           修订、候选、术语
useOcrWorkflow.ts              捕获、框选、识别、应用
useCopyFeedback.ts             复制状态
```

### 边界要求

- 子组件通过 props/emits 传明确 DTO，不直接拿完整页面状态。
- `useTranslationWorkspace` 不应重新成为 500 行总控；建议不超过 200–250 行。
- OCR 关闭逻辑应由 OCR workflow 自己提供 `reset()`，不要在页面逐字段清空。
- 词典上下文也应提供统一 `close/reset/cancel`。

---

## 4.11 RDR-002：全局 CustomEvent 和 sessionStorage 是隐式应用总线

### 当前使用

- `lexiflow:settings-updated`：设置页和侧栏同步。
- `lexiflow:ocr-capture`：侧栏触发翻译页 OCR。
- `sessionStorage["lexiflow:retranslate"]`：历史页向翻译页传会话。
- `navigation:open`：使用裸字符串 IPC 事件。

### 问题

- 事件名无法由 TypeScript 完整约束。
- 生命周期和监听顺序决定行为。
- 页面未挂载时事件可能丢失。
- 数据来源与所有权不清晰。
- E2E 容易依赖偶然时序。

### 重构要求

1. 设置同步：使用 `SettingsStore` 或 `useSettingsState()` 单例响应式状态；主进程更新后返回 snapshot。
2. OCR 命令：通过路由 query 或应用级 command state：

```ts
router.push({ name: "translation", query: { action: "ocr" } })
```

更稳妥的是 `AppCommandStore.enqueue({ type: "capture-ocr" })`。
3. 历史重开：使用 `historyId` 的明确 IPC/use case，不传完整记录。
4. 导航通道加入 `IPC_CHANNELS` 和 `TranslatorApi`，禁止裸字符串。
5. `document:event` 同样使用统一通道常量。

不要为了这些需求引入通用事件总线库；一个小型 typed store 即可。

---

## 4.12 CON-001：共享契约文件过大且需要多点手工同步

### 现状

`electron/shared/types.ts` 混合：

- 翻译领域类型；
- 命名；
- 词典；
- 术语；
- 文档持久化记录；
- OCR；
- Provider 配置；
- 设置；
- 历史；
- Session；
- IPC 事件和通道。

新增能力需要同时修改：

1. `shared/types.ts`
2. `shared/api.ts`
3. `preload/index.ts`
4. `main/ipc/register.ts`
5. `src/platform/translator.ts` 浏览器预览桩

### 重构要求

拆分共享契约：

```text
electron/shared/contracts/
├─ runtime.ts
├─ settings.ts
├─ translation.ts
├─ history.ts
├─ dictionary.ts
├─ glossary.ts
├─ document.ts
├─ ocr.ts
├─ window.ts
├─ channels.ts
└─ api.ts
```

区分三类模型：

- Domain Model：业务内部模型。
- Persistence Model：磁盘 schema，放 storage 模块。
- IPC DTO：跨进程传输模型，放 shared/contracts。

例如 `DocumentTaskRecord.sourcePath` 属于主进程持久化数据，不应无差别暴露给所有 Renderer。对 Renderer 返回精简 DTO，必要时隐藏绝对路径。

### preload 简化

建立通用小型 helper：

```ts
const invoke = <K extends InvokeChannel>(channel: K) => (...args: InvokeArgs<K>) =>
  ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<K>>;
```

不要求代码生成，但通道映射应由一个类型表驱动，减少重复导入和手写返回类型。

### 浏览器预览桩

将 `src/platform/translator.ts` 中的大型假实现拆到：

```text
src/platform/preview/
├─ create-preview-api.ts
├─ preview-translation.ts
├─ preview-history.ts
└─ preview-dictionary.ts
```

预览桩应通过 `satisfies TranslatorApi` 校验，但不与生产 API 获取逻辑混在一个文件。

---

## 4.13 STO-001：存储损坏被静默解释为“空数据”

### 现状

`JsonStore.read()` 对所有错误都返回 fallback：

```ts
try {
  return JSON.parse(...)
} catch {
  return structuredClone(this.fallback)
}
```

### 风险

以下情况表现完全相同：

- 文件不存在；
- JSON 损坏；
- 权限错误；
- 磁盘 IO 错误；
- schema 不兼容。

用户可能看到设置、历史或文档任务突然清空，却没有恢复提示。

### 重构要求

1. 区分 `ENOENT`：只有文件不存在才使用 fallback。
2. JSON 解析失败：
   - 将原文件重命名为 `*.corrupt.<timestamp>.json`；
   - 返回 fallback；
   - 记录不含用户正文的诊断事件；
   - 在 UI 显示“已隔离损坏文件，可查看路径”的提示。
3. 权限和磁盘错误：向上抛出，不静默覆盖。
4. 每个 Store 进行 schema 校验和显式 migration。
5. 写入前可选保留最近一个 `.bak`，至少对设置和历史启用。
6. Store 内部更新采用不可变替换，避免持久化失败后内存状态与磁盘状态不一致。

### 验收标准

- 手工破坏 `history.json` 后，旧文件被隔离而非覆盖。
- 权限错误会明确报告。
- migration 测试覆盖至少前一个 schema 版本。

---

## 4.14 SET-002：设置 UI 只有视觉拆分，没有状态边界

### 现状

设置子组件接收完整 `AppSettings`，并直接修改嵌套字段：

```ts
props.settings.shortcuts[key] = value;
emit("save");
```

`useSettingsForm` 使用 `shallowRef<AppSettings>`，同时负责：

- 加载；
- 快照；
- 保存队列；
- 回滚；
- 远程 Provider 隐私确认；
- Provider 测试；
- 跨组件事件广播。

### 重构要求

1. 每个设置页只拿该领域 DTO：

```ts
<SelectionSettings
  :value="settings.shortcuts"
  @update="settingsCommands.updateShortcuts($event)"
/>
```

2. 子组件使用本地 draft，不直接修改 prop。
3. Provider 隐私确认属于 Provider 设置用例，不属于通用表单保存函数。
4. Provider 连通性测试独立为 `useProviderConnectionTest()`。
5. 设置保存状态按 section 管理，避免一个全局 `saving` 阻塞所有配置。
6. 删除 `window.dispatchEvent("lexiflow:settings-updated")`。

---

## 4.15 WIN-002：窗口管理边界继续膨胀

### 现状

一个 `WindowManager` 管理三种完全不同的窗口：

- 主窗口：导航、隐藏/退出。
- 快速翻译弹窗：定位、固定、自动隐藏、自适应尺寸、边界记忆。
- 划词提示窗：定位、5 秒超时、点击命中判断。

### 重构建议

拆分为：

```text
window/
├─ window-factory.ts            公共安全配置与加载 Renderer
├─ main-window-controller.ts
├─ popup-window-controller.ts
├─ selection-tip-controller.ts
└─ window-coordinator.ts        对外聚合少量跨窗口动作
```

`WindowFactory` 统一：

- preload；
- sandbox；
- navigation security；
- renderer URL；
- render-process-gone 日志；
- zoom factor。

各 Controller 只管理自身窗口生命周期。

该项放在 P2，等设置 patch 和导航问题稳定后执行，避免同时修改过多行为。

---

## 4.16 QLT-001：缺少工程约束，架构容易再次退化

### 现状

`package.json` 当前有 typecheck、build、test、e2e 和打包命令，但没有：

- lint；
- format check；
- import boundary；
- 循环依赖检查；
- 大文件/复杂度告警。

preload 当前已经出现不统一的逗号和 import 排版，说明仅靠 TypeScript 无法维护一致性。

### 重构要求

建议增加：

```json
{
  "lint": "eslint .",
  "format:check": "prettier --check .",
  "check:deps": "dependency-cruiser ...",
  "check": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
}
```

架构规则至少包括：

- `src/` 不得直接导入 `electron/main/`。
- `domain/` 不得导入 Electron、Node 文件系统、Vue。
- `application/` 只通过 ports 访问 infrastructure。
- `infrastructure/` 可以实现 ports，但 domain 不可反向依赖。
- `shared/contracts` 不得导入主进程实现。
- 页面不得直接调用多个底层 IPC；优先调用 feature composable。

不建议一开始设置过严的行数门槛。可先对以下文件设重构目标：

- 页面文件建议不超过 300 行。
- composable/use case 建议不超过 250 行。
- IPC registrar 建议每个领域不超过 200 行。

这些是告警目标，不是为拆文件而拆文件的硬规则。

---

## 4.17 UX-001：质量检查遗留与复制交互一致性

现有主窗口 `ResultPanel` 已经使用复制图标，当前仓库中未发现翻译结果区域仍显示“质量检查”按钮；此前建议已经部分落地。

本次重构仍需执行一次全仓清理：

1. 搜索并删除已无入口的：
   - `qualityIssues`
   - `runQualityCheck`
   - `quality.ts`
   - 相关测试、样式和文档
2. 若术语应用检查仍被业务使用，保留为翻译结果的轻量 metadata，不再暴露“质量检查”概念。
3. 主窗口复制操作维持图标化、hover/focus 显示。
4. `PopupPage.vue` 底部仍使用“原文 / 双语 / 译文”文字按钮，应与主窗口统一为图标按钮，并保留 `title`、`aria-label`。
5. 停止和重试属于任务状态操作，应始终可见，不随复制工具栏隐藏。
6. 复制成功统一短暂切换勾选图标，不使用多个不同的“已复制”提示模式。

该项主要是清理和一致性工作，不应阻塞核心架构重构。

---

# 5. 推荐目标架构

## 5.1 总体原则

采用实用的四层结构：

```text
interfaces → application → domain ← infrastructure
```

- `interfaces`：IPC、Electron 事件、Renderer adapter。
- `application`：明确的业务用例和事务边界。
- `domain`：纯逻辑、状态机、策略、模型与 ports。
- `infrastructure`：Electron、Provider、文件系统、OCR、数据库/JSON 实现。

不要求教科书式 DDD，也不引入复杂聚合根。只要依赖方向明确、核心逻辑可测试即可。

## 5.2 建议目录

```text
electron/main/
├─ bootstrap/
│  ├─ application.ts
│  └─ create-container.ts
│
├─ application/
│  ├─ translation/
│  │  ├─ translate-text.ts
│  │  ├─ revise-segment.ts
│  │  ├─ get-alternatives.ts
│  │  ├─ explain-dictionary-context.ts
│  │  └─ open-history-session.ts
│  ├─ document/
│  │  ├─ import-document.ts
│  │  ├─ start-document-task.ts
│  │  ├─ pause-document-task.ts
│  │  └─ export-document.ts
│  ├─ settings/
│  │  └─ settings-service.ts
│  └─ privacy/
│     └─ clear-local-data.ts
│
├─ domain/
│  ├─ translation/
│  │  ├─ translation-engine.ts
│  │  ├─ policy.ts
│  │  ├─ stream-reducer.ts
│  │  ├─ structured-output.ts
│  │  ├─ segments.ts
│  │  └─ ports.ts
│  ├─ document/
│  │  ├─ task-state.ts
│  │  ├─ chunking.ts
│  │  └─ ports.ts
│  └─ settings/
│     ├─ commands.ts
│     └─ validation.ts
│
├─ infrastructure/
│  ├─ provider/
│  ├─ persistence/
│  ├─ ocr/
│  ├─ window/
│  ├─ clipboard/
│  ├─ hotkey/
│  └─ selection/
│
└─ interfaces/
   └─ ipc/
      ├─ register-all.ts
      └─ register-*.ts

electron/shared/contracts/
├─ api.ts
├─ channels.ts
├─ settings.ts
├─ translation.ts
├─ document.ts
├─ dictionary.ts
├─ history.ts
├─ ocr.ts
└─ window.ts

src/
├─ app/
│  ├─ app-commands.ts
│  └─ settings-state.ts
├─ features/
│  ├─ translation/
│  ├─ dictionary/
│  ├─ ocr/
│  ├─ settings/
│  └─ history/
├─ pages/
├─ platform/
│  ├─ translator.ts
│  └─ preview/
└─ components/
```

## 5.3 核心 Port 接口

只为确实需要替换或测试的外部依赖定义接口：

```ts
interface ModelGateway {
  translate(...): AsyncIterable<TranslationChunk>;
  chat(...): AsyncIterable<TranslationChunk>;
  revise(...): AsyncIterable<TranslationChunk>;
}

interface SettingsRepository {
  read(): Promise<StoredSettings>;
  write(value: StoredSettings): Promise<void>;
}

interface HistoryRepository {
  add(item: TranslationHistory): Promise<void>;
  get(id: string): TranslationHistory | undefined;
}

interface OcrEngine {
  recognize(imagePath: string, signal: AbortSignal): Promise<OcrEngineResult>;
}

interface EventPublisher<T> {
  publish(event: T): void;
}
```

不要为每个纯函数创建接口，也不要引入通用 Repository 基类。

---

# 6. 分阶段实施计划

## 阶段 0：建立行为基线和回归测试

### 目标

先锁定现有行为和 P0 bug，避免重构过程中无法判断回归。

### 任务

1. 新增 `NAV-001` 测试：已有窗口从历史页打开 `/`。
2. 新增 `WIN-001` characterization test：模拟流式结果，统计 popupBounds 保存次数。
3. 新增 `SET-001` 并发测试：Provider patch 与 window patch 不互相覆盖。
4. 新增 OCR 坐标纯函数测试：归一化选区到像素区域。
5. 新增 IPC 非法输入测试。
6. 记录当前核心流程 E2E：
   - 主窗口翻译；
   - 快速弹窗翻译；
   - 历史恢复；
   - OCR；
   - 设置快捷键失败回滚。

### 要求

- 对确实存在的 bug，测试可以先标记为 failing 或 `todo`，修复后启用。
- 不要在本阶段移动大量文件。

### 完成条件

`pnpm test`、`pnpm build` 通过，并有明确的测试基线。

---

## 阶段 1：修复 P0 正确性问题

### 任务

1. 修复根路由导航。
2. 阻止程序自适应尺寸写入 popupBounds。
3. 给自动适配和用户尺寸保存增加防抖。
4. 将 popupBounds 修改改为主进程字段 patch。
5. IPC 先为高风险通道补齐 sender 和 runtime validation：
   - settings update；
   - translation/revision/alternatives start；
   - document import/start/export；
   - OCR；
   - clipboard；
   - window 操作。

### 完成条件

P0 测试全部通过，行为不依赖时序运气。

---

## 阶段 2：重构设置服务

### 任务

1. 新建 `SettingsService` 和 `SettingsCommand`。
2. `SettingsStore` 降级为 persistence adapter，不再负责所有业务事务。
3. 将快捷键事务、startup、字体、selection 开关拆成按字段应用。
4. 替换：
   - SettingsPage 完整对象保存；
   - AppSidebar 完整对象保存；
   - Tray 完整对象保存；
   - Window bounds 完整对象保存。
5. Renderer 建立单一 settings state，删除 CustomEvent。
6. 设置子组件不再直接修改 prop。

### 推荐 PR 范围

只重构设置，不同时重构翻译引擎。

### 完成条件

- 任何设置入口都使用命令/patch。
- 并发更新测试通过。
- API Key 行为和快捷键失败回滚不退化。

---

## 阶段 3：拆分 IPC 契约和注册器

### 任务

1. 拆分 `shared/types.ts` 为领域 contracts。
2. 将 channel 常量集中在 `contracts/channels.ts`。
3. 新建领域 IPC registrar。
4. 建立统一 invoke/on 注册 helper。
5. 将裸字符串 `navigation:open`、`document:event` 纳入契约。
6. 拆分浏览器预览 API。
7. 确保 preload 只做白名单转发，不含业务逻辑。

### 兼容策略

- 通道字符串第一阶段保持不变，避免 Renderer 与 Main 同时大面积改动。
- 先移动和类型化，再在后续版本考虑 API version 升级。

### 完成条件

新增一个 IPC 只需修改对应领域 contract、preload mapping 和 registrar，不再触碰一个巨型文件。

---

## 阶段 4：提取统一 TranslationEngine

### 任务

1. 提取纯 `translation-state reducer`。
2. 提取 `TranslationEngine`：输入清理、Policy、Provider、流解析、修复、结果组装。
3. Provider 通过 `ModelGatewayFactory`/factory port 注入，不在用例中反复直接 `createProvider()`。
4. 拆分 use case：翻译、修订、候选、词典解释。
5. 引入 `RequestCoordinator` lanes。
6. Session source 显式化。
7. `TranslationManager` 逐步变为兼容 facade，最后删除或缩减。

### 完成条件

- TranslationEngine 单元测试不启动 Electron。
- 主窗口、弹窗使用同一引擎。
- 不同交互 lane 不会错误互相取消。

---

## 阶段 5：重构 DocumentManager

### 任务

拆成：

```text
DocumentImportService      文件选择、格式检测、文本提取
DocumentTaskQueue          队列、暂停、取消、空闲等待
DocumentTranslationWorker  对单个 chunk 调 TranslationEngine
DocumentExportService      translated/bilingual/json 导出
DocumentTaskRepository     持久化
```

要求：

- 队列不长期持有 Renderer `WebContents` 作为业务数据。
- 文档事件通过 `taskId` 广播给仍存活的相关窗口，或由 Renderer 拉取最新状态。
- 文档任务状态变更只走状态机函数。
- 分块失败记录保留，可重试。
- 调用统一 TranslationEngine。

### 完成条件

`DocumentManager` 被删除，或只保留一个很薄的 facade。

---

## 阶段 6：重构 OCR 流程

### 任务

1. 分离捕获、裁剪、识别。
2. 改为先框选、后 OCR。
3. 增加 captureId 内存缓存和过期清理。
4. 增加取消、超时、结构化错误。
5. 拆分 Renderer `OcrWorkspace`。
6. 增加多屏与 DPI 测试。

### 注意

OCR 属于 Windows 系统能力，必须保留真实 Windows 手工回归。单元测试只覆盖坐标、裁剪和状态流，不能代替真实识别测试。

---

## 阶段 7：拆分 Renderer 页面

### 任务

1. 拆分 TranslationPage。
2. 拆分 PopupPage 的 header/source/result/footer 和 popup workflow。
3. HistoryPage 使用 historyId 打开 Session，不再使用 sessionStorage。
4. 统一 copy feedback。
5. 清理质量检查遗留。
6. 删除 CustomEvent 应用总线。

### 完成条件

- 页面主要用于布局和组合。
- feature composable 的职责清晰，可单测核心 reducer。
- 主窗口与弹窗共享状态模型和基础组件，但不强行复用差异很大的布局。

---

## 阶段 8：存储恢复与工程约束

### 任务

1. JsonStore 区分 ENOENT、损坏、权限异常。
2. 增加 corrupt 隔离、备份和诊断。
3. Store schema 校验与 migration 测试。
4. 增加 ESLint、Prettier、依赖边界检查。
5. 清理重复文档、旧路径、无效测试和样式。
6. 更新架构文档、开发指南和 review checklist。

---

# 7. 建议拆分为独立 PR

| PR | 范围 | 不应混入 |
|---|---|---|
| PR-1 | 基线测试 + 导航 bug | 大目录移动 |
| PR-2 | 弹窗 resize 与 settings 写入修复 | TranslationEngine |
| PR-3 | SettingsService + Renderer 设置状态 | OCR |
| PR-4 | IPC contracts 与 registrar 拆分 | UI 改版 |
| PR-5 | TranslationEngine + RequestCoordinator | 文档导入导出 |
| PR-6 | Document 服务拆分 | 设置页重构 |
| PR-7 | OCR 两阶段流程 | Provider 大改 |
| PR-8 | Renderer 页面拆分 + UX 清理 | 持久化 schema 大改 |
| PR-9 | 存储恢复 + lint/架构检查 + 文档 | 新功能 |

每个 PR 应可独立回滚，不允许提交一个同时移动数十个文件、改 IPC、改 UI、改持久化的超大 PR。

---

# 8. Coding Agent 执行规则

## 8.1 开始前

1. 阅读：
   - `README.md`
   - `docs/architecture.md`
   - `docs/development.md`
   - 本任务书
2. 运行并记录：

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

3. 若基线失败，先记录现有失败，禁止把现有失败误判为本次引入。
4. Windows 相关功能必须在 Windows 环境验证。

## 8.2 修改原则

- 一次只完成一个阶段或一个 PR 范围。
- 先加 characterization test，再改实现。
- 不进行纯粹为了“看起来分层”的目录搬迁。
- 先建立新接口和适配器，再逐步切换调用方，最后删除旧代码。
- 保持现有用户数据兼容；涉及 schema 必须写 migration。
- 保持 IPC channel 字符串兼容，除非同时提供版本迁移。
- 不改变现有产品文案和视觉风格，除非任务明确要求。
- 不引入 Pinia、RxJS、IoC 容器等重量级依赖，除非能证明现有轻量方案无法满足。
- 不隐藏异常；错误必须被映射、记录或明确忽略并说明原因。

## 8.3 每完成一项必须输出

```text
1. 修改了什么
2. 为什么这样修改
3. 涉及哪些文件
4. 新增/修改了哪些测试
5. 运行结果
6. 尚存风险
7. 下一步建议
```

## 8.4 禁止事项

- 禁止一次性重写整个 Electron 主进程。
- 禁止在 Renderer 直接访问 Node/Electron 内部能力。
- 禁止通过 `any`、类型断言或关闭规则绕过类型问题。
- 禁止继续新增裸字符串 IPC 通道。
- 禁止继续用 `window.dispatchEvent` 扩展应用业务命令。
- 禁止以完整 `AppSettings` 保存单字段修改。
- 禁止业务层直接持有 `BrowserWindow`、`WebContents`、文件对话框等 UI 对象。
- 禁止删掉旧 migration 或直接清空用户数据解决 schema 问题。

---

# 9. 测试策略

## 9.1 纯单元测试

重点覆盖：

- TranslationEngine 输入到输出。
- NDJSON 流式 reducer。
- 缺失句段修复。
- RequestCoordinator lane 取消行为。
- Settings command merge 与 revision。
- Document task state machine。
- OCR 选区坐标和裁剪区域。
- Store migration 与损坏恢复。
- IPC schema validation。

## 9.2 模块测试

使用 Fake：

- Fake ModelGateway。
- InMemory SettingsRepository。
- InMemory HistoryRepository。
- Fake EventPublisher。
- Fake Clock / IdGenerator（只在需要确定性时使用）。

验证完整 use case，不启动 Electron GUI。

## 9.3 Electron E2E

至少覆盖：

1. preload API 契约。
2. 主窗口各路由。
3. 历史页打开翻译会话。
4. 弹窗流式输出时不频繁写设置。
5. 设置并发更新不覆盖。
6. 快捷键注册失败回滚。
7. 清理本地数据时后台任务停止。

## 9.4 Windows 手工回归

- 托盘。
- 全局快捷键。
- 划词提示。
- 多显示器定位。
- 高 DPI。
- OCR 语言包和选区识别。
- 安装版和 Portable。
- safeStorage API Key。

---

# 10. Definition of Done

整个重构完成需满足：

- [ ] P0 缺陷均有自动化回归测试。
- [ ] 设置修改采用字段命令/patch，不再全量覆盖。
- [ ] 程序自动缩放不会持久化 popupBounds。
- [ ] 根路由可在已有主窗口中正确导航。
- [ ] IPC 按领域拆分，外部输入均有运行时校验。
- [ ] 无新增裸字符串 IPC。
- [ ] 主翻译和文档分块共用 TranslationEngine。
- [ ] 交互请求按 lane 管理，不再共用单一 activeRequest。
- [ ] 主进程和 Renderer 使用统一翻译状态 reducer。
- [ ] TranslationPage 和 PopupPage 完成职责拆分。
- [ ] CustomEvent 和 sessionStorage 不再承载核心业务命令。
- [ ] OCR 改为先框选、后识别，并支持取消/超时。
- [ ] JSON 损坏不会静默表现为数据清空。
- [ ] 质量检查遗留代码已确认删除或有明确保留理由。
- [ ] 主窗口与弹窗复制交互一致。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm build` 通过。
- [ ] `pnpm test:e2e` 通过。
- [ ] Windows 手工回归通过。
- [ ] `docs/architecture.md` 与实际目录一致。

---

# 11. 首批建议直接执行的任务

为了降低风险，Coding Agent 第一轮只完成以下内容：

1. 为历史页打开根路由补回归测试并修复。
2. 为弹窗自适应高度增加“程序调整不持久化”机制。
3. 对用户拖动尺寸保存增加防抖。
4. 新增最小的 `SettingsService.patchWindow()`，仅替换 popupBounds 写入。
5. 将 `navigation:open` 和 `document:event` 纳入 `IPC_CHANNELS`。
6. 为 translation start、settings update、clipboard write 补运行时校验。
7. 输出本轮测试结果，不开始 TranslationEngine 大重构。

第一轮完成并稳定后，再进入 SettingsService 全量重构。

---

# 12. 重点文件清单

```text
package.json

electron/main/bootstrap/application.ts
electron/main/ipc/register.ts
electron/main/ipc/security.ts
electron/main/translation/manager.ts
electron/main/translation/session-store.ts
electron/main/document/manager.ts
electron/main/window/manager.ts
electron/main/ocr/windows-ocr.ts
electron/main/core/model-task-scheduler.ts
electron/main/core/translation-policy.ts
electron/main/core/settings-transaction.ts
electron/main/storage/settings.ts
electron/main/storage/json-store.ts
electron/main/storage/history.ts
electron/main/provider/index.ts
electron/main/provider/types.ts

electron/shared/types.ts
electron/shared/api.ts
electron/preload/index.ts

src/App.vue
src/components/AppSidebar.vue
src/pages/TranslationPage.vue
src/pages/PopupPage.vue
src/pages/HistoryPage.vue
src/pages/SettingsPage.vue
src/features/translation/useTranslation.ts
src/features/ocr/useOcrCapture.ts
src/features/settings/useSettingsForm.ts
src/features/settings/sections/SelectionSettings.vue
src/platform/translator.ts

tests/
```

---

## 最终说明

这次重构的重点不是把目录变得更“漂亮”，而是解决四个根本问题：

1. **业务用例有明确所有者。**
2. **跨进程边界有明确契约和运行时校验。**
3. **状态更新是字段级、可串行、可回滚的。**
4. **翻译、文档和 OCR 的核心流程可以脱离 UI 独立测试。**

只要这四点完成，后续继续增加词典能力、OCR 能力、Provider、翻译模式或文档格式时，修改范围才会保持可控。
