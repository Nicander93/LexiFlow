# LexiFlow UI / UX 与 OCR 重构执行计划

> 适用仓库：`Nicander93/LexiFlow`
> 基线：当前 `main` 分支
> 用途：直接交给 Coding Agent 分阶段实施

---

## 1. 改造目标

本轮不继续扩展新功能，重点收敛现有翻译主流程：

1. 简化翻译页的信息层级。
2. 修复长文本翻译后“一句一行”的问题。
3. 改善快速翻译悬浮窗的唤起、隐藏和恢复体验。
4. 让悬浮窗翻译结果可以无缝带入主窗口。
5. 重构 OCR 流程，避免截到应用自身、识别范围错误和自动覆盖原文。
6. 移除价值有限的“质量检查”功能。
7. 统一页面文案。
8. 将复制操作改为悬停后显示的图标按钮。
9. 收敛当前偏网页化的视觉风格，提高信息密度。

---

## 2. 当前主要问题

### 2.1 翻译页信息层级重复

当前页面同时包含：

- 通用 / 技术 / 学术快捷入口。
- Profile 下拉框。
- 目标语言。
- Provider 状态。
- OCR 屏幕选择。
- OCR 按钮。
- 词典 / AI 翻译切换。
- 质量检查。
- 多个复制按钮。

其中“快捷场景”和“Profile”本质上都在控制翻译策略，用户无法直观理解二者关系。

### 2.2 OCR 控件位置不合理

当前 OCR 屏幕选择和 OCR 按钮常驻在原文面板顶部：

- 普通翻译时长期占用空间。
- 屏幕分辨率下拉框信息量过大。
- OCR 操作与普通文本输入混在同一层级。
- 截图、框选、识别、编辑流程缺少明确阶段。

### 2.3 OCR 当前流程存在功能问题

当前流程大致为：

```text
显示并聚焦主窗口
→ 截取整个屏幕
→ 对整屏进行 OCR
→ 用户在截图预览中框选
→ 根据文本块中心点筛选识别结果
```

存在以下问题：

1. 可能截到 LexiFlow 自身窗口。
2. 截图使用固定缩略图尺寸，可能降低高分辨率屏幕的识别精度。
3. 用户框选后没有对裁剪区域重新 OCR。
4. 框选只是筛选整屏 OCR 的文本块，边界稍有偏差就可能漏行。
5. OCR 完成后直接覆盖原文输入。
6. “用编辑后的文本翻译”可能只是填入原文，文案与行为不一致。

### 2.4 长文本被强制显示为一句一行

当前实现将语义句段直接映射成视觉块，并用换行拼接最终译文，导致：

```text
语义切段
=
视觉换行
=
复制后的文本换行
```

句段切分应只服务于：

- 流式返回。
- 原文和译文联动。
- 局部重译。
- 候选译法。
- 词典上下文。

不应直接决定最终段落格式。

### 2.5 快速翻译悬浮窗状态不连续

当前悬浮窗存在：

- 失焦后容易立即隐藏。
- 使用无焦点方式弹出，键盘交互不稳定。
- 消失后结果不会自动出现在主窗口。
- 点击“主窗口”只打开页面，没有恢复当前翻译。
- 主窗口和悬浮窗分别维护状态，缺少统一 Session。

### 2.6 “质量检查”价值有限

当前质量检查主要检测：

- 数字、单位、URL、代码块是否遗漏。
- 不同原文是否出现重复译文。
- 译文是否仍主要是源语言。
- 术语表指定译法是否应用。

这些检查误报概率较高，也没有形成自动修正闭环。对于当前产品定位，它增加了复杂度，实际价值有限。

### 2.7 页面文案不够准确

例如：

- 处理结果。
- 开始处理。
- 处理完成。
- 译文会在这里流动起来。
- 正在唤醒模型。
- OCR 截图。

这些表达不够直接，也不符合桌面效率工具的语气。

### 2.8 复制操作长期占据界面

当前复制原文、复制双语、复制结果等按钮始终显示：

- 占用结果面板工具栏空间。
- 图标含义不统一。
- “双”字按钮不直观。
- 页面顶部“已复制”状态与实际操作位置分离。

---

# 3. 目标交互设计

## 3.1 翻译页整体结构

推荐结构：

```text
翻译    [通用 | 技术 | 学术 | 更多]    [自动识别 → 中文]    [本地模型]

┌ 原文 ───────────────────────── [粘贴] [截图识别] [清空] ┐
│ 输入或粘贴需要翻译的内容……                              │
│                                                1,235 字符 │
│                                                   [翻译] │
└──────────────────────────────────────────────────────────┘

┌ [词典] [译文] ───────────────────────────────────────────┐
│ 译文内容                                                  │
│                                                          │
│ 鼠标进入后显示：                              [双语] [复制] │
└──────────────────────────────────────────────────────────┘
```

调整原则：

- 主界面不再直接显示“Profile”这一内部概念。
- 将 Profile 对用户展示为“翻译场景”。
- 默认显示通用、技术、学术。
- 自定义 Profile 放入“更多”菜单。
- OCR 屏幕选择不再常驻。
- Provider 状态简化为模型状态信息。

---

## 3.2 移除质量检查

### 页面修改

删除：

- “质量检查”按钮。
- `qualityIssues` 状态。
- `runQualityCheck()`。
- 质量检查结果面板。
- 相关样式。

### 代码处理

重点检查：

- `src/pages/TranslationPage.vue`
- `electron/shared/quality.ts`
- `electron/shared/types.ts`
- 对应测试文件
- 文档中关于质量检查的描述

建议：

- 从 UI 完全移除。
- 删除 Renderer 中相关状态和调用。
- 如果 `quality.ts` 仅被翻译页使用，则直接删除。
- 如果仍被其他模块依赖，先保留为内部工具，但不向用户暴露。

后续如需要术语检查，可单独做轻量提示：

```text
术语表中指定的 2 个词未使用推荐译法
```

不要重新引入“质量检查”这一大概念。

---

## 3.3 复制按钮改为悬停显示

### 目标行为

- 平时仅显示“译文”标题。
- 鼠标移入译文面板后，右上角操作图标淡入。
- 键盘焦点进入译文面板时也显示。
- 点击复制后，按钮图标短暂切换为勾选状态。
- 不再在页面顶部显示“已复制”Badge。

### 操作分布

原文面板：

- 复制原文。
- 粘贴。
- 截图识别。
- 清空。

译文面板：

- 复制译文。
- 复制双语。

运行状态操作：

- 停止：翻译进行中始终显示。
- 重试：失败状态始终显示。
- 不跟随悬停隐藏。

### 样式建议

```css
.result-panel .copy-actions {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.result-panel:hover .copy-actions,
.result-panel:focus-within .copy-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
```

必须保留：

- `title`
- `aria-label`
- `focus-visible`
- 键盘可操作性

### 图标要求

- 复制译文：标准 Copy 图标。
- 复制双语：双栏、左右对照或双文档图标。
- 不再使用文字“ 双 ”代替图标。
- 成功后 1 秒内切换为 Check 图标。

---

# 4. 长文本分段与展示重构

## 4.1 核心原则

句段切分只服务于翻译逻辑，不直接决定视觉布局。

需要区分：

1. 语义句段边界。
2. 原文自然换行。
3. 原文段落边界。
4. Markdown / 代码块边界。
5. 最终复制文本结构。

## 4.2 数据结构调整

建议扩展 `SourceSegment`：

```ts
type SegmentBoundary =
  | "inline"
  | "sentence"
  | "line"
  | "paragraph"
  | "block";

interface SourceSegment {
  id: string;
  source: string;
  sourceStart: number;
  sourceEnd: number;

  paragraphIndex: number;
  boundaryAfter: SegmentBoundary;

  sourcePrefix?: string;
  sourceSuffix?: string;
}
```

说明：

- `inline`：同一视觉行内继续。
- `sentence`：语义句子结束，但视觉上不强制换行。
- `line`：原文存在单换行。
- `paragraph`：原文存在空行或段落边界。
- `block`：代码块、列表、引用等结构边界。

## 4.3 重组译文

新增统一方法：

```ts
function assembleDisplayText(
  segments: TranslationSegment[],
  targetLanguage: string
): string
```

规则：

- 同一段落内句子连续显示。
- 中文目标语言通常不额外增加空格。
- 英文目标语言句子之间补一个空格。
- 原文单换行保留单换行。
- 原文段落保留双换行。
- Markdown、列表和代码块按结构还原。
- 复制译文时使用该方法。
- 复制双语时也必须使用结构化结果，而不是简单逐句换行。

## 4.4 `SegmentedText` 展示调整

根据边界动态渲染，不能继续统一使用：

```css
display: block;
margin-bottom: 7px;
```

示例：

```vue
<template v-for="segment in segments">
  <span class="translation-segment">{{ segment.target }}</span>
  <span v-if="segment.boundaryAfter === 'sentence'"> </span>
  <br v-else-if="segment.boundaryAfter === 'line'" />
  <span v-else-if="segment.boundaryAfter === 'paragraph'">
    <br /><br />
  </span>
</template>
```

## 4.5 验收示例

原文：

```text
LexiFlow is a local-first translation tool. It supports quick translation and local models.

It also supports OCR and dictionary lookup.
```

目标结果：

```text
LexiFlow 是一款本地优先的翻译工具。它支持快速翻译和本地模型。

它还支持 OCR 和词典查询。
```

不能显示为：

```text
LexiFlow 是一款本地优先的翻译工具。
它支持快速翻译和本地模型。
它还支持 OCR 和词典查询。
```

---

# 5. 快速翻译悬浮窗重构

## 5.1 引入共享 TranslationSession

新增：

```ts
interface TranslationSession {
  id: string;
  source: "main" | "popup" | "ocr" | "history";

  sourceText: string;
  resultText: string;
  segments: TranslationSegment[];

  status: TranslationStatus;
  profileId: string;
  targetLanguage: TargetLanguage;

  requestId?: string;
  historyId?: string;

  createdAt: number;
  updatedAt: number;
}
```

## 5.2 Session 管理职责

建议新增：

```ts
class TranslationSessionStore {
  getActive(): TranslationSession | undefined;
  create(input: CreateSessionInput): TranslationSession;
  patch(id: string, patch: Partial<TranslationSession>): void;
  clear(id?: string): void;
}
```

主窗口和悬浮窗通过 IPC 订阅同一个 Session：

```text
popup:start
→ 创建 Session
→ translation:event 更新 Session
→ popup 订阅
→ main window 订阅
```

## 5.3 悬浮窗隐藏规则

调整为：

- Esc：隐藏悬浮窗，不清除 Session。
- 失焦：延迟约 250–350ms 后隐藏。
- 鼠标正在悬浮窗内时不自动隐藏。
- 固定状态下不因失焦隐藏。
- 翻译尚未结束时隐藏窗口，后台继续接收结果。
- 用户再次打开主窗口时恢复当前 Session。

## 5.4 打开主窗口行为

点击“主窗口”时：

```text
显示主窗口
→ 导航到翻译页
→ 加载当前 TranslationSession
→ 恢复原文
→ 恢复流式状态或最终译文
→ 恢复句段、翻译场景和目标语言
```

不应只是打开空白翻译页。

## 5.5 快捷键再次触发

推荐行为：

- 快捷键再次触发时创建新 Session。
- 旧 Session 已完成时保留到历史。
- 旧 Session 仍在运行时取消旧请求，再创建新 Session。
- 主窗口当前手动输入但尚未翻译的内容，不应被后台悬浮窗 Session 自动覆盖。
- 主窗口只有在用户点击“主窗口”或明确选择“打开最近快速翻译”时加载 Session。

## 5.6 悬浮窗尺寸和动效

推荐流程：

```text
小尺寸读取状态
→ 获取文本
→ 平滑扩展
→ 词典命中时使用紧凑高度
→ 长文本翻译时限制最大高度并允许滚动
```

动效控制在 120–180ms 内，不使用明显弹跳。

---

# 6. OCR 流程重构

## 6.1 推荐完整流程

```text
用户点击“截图识别”
→ 临时隐藏主窗口和悬浮窗
→ 等待系统桌面重绘
→ 按真实屏幕尺寸截取屏幕
→ 打开全屏透明选区窗口
→ 用户拖动框选区域
→ 裁剪选区图像
→ 对裁剪后的图像执行 OCR
→ 显示识别文本确认框
→ 用户选择：替换原文 / 追加到原文 / 立即翻译
```

## 6.2 第一阶段可接受方案

如暂不实现原生跨屏选区，至少做到：

1. 截图前隐藏 LexiFlow 窗口。
2. 截图使用更接近真实分辨率的图像。
3. 用户框选后裁剪图像。
4. 对裁剪后的区域重新 OCR。
5. 不再使用整屏 OCR 文本块中心点筛选作为最终结果。
6. OCR 结果不自动写入原文。

## 6.3 OCR 结果确认组件

推荐弹窗：

```text
识别结果

[可编辑文本框]

插入方式：
(●) 替换原文
( ) 追加到原文
( ) 复制到剪贴板

[取消] [填入原文] [立即翻译]
```

行为必须准确：

- “填入原文”：只填入，不翻译。
- “立即翻译”：填入并立即开始翻译。
- “追加到原文”：保留当前内容并在末尾追加。
- 取消：不修改原文。

## 6.4 OCR 入口位置

原文面板工具栏只保留一个图标按钮：

```text
截图识别
```

屏幕选择放入截图流程内部。

如果只有一个显示器，不显示屏幕选择步骤。

如果有多个显示器：

- 默认使用鼠标所在屏幕。
- 允许用户在选区层切换屏幕。
- 不在主翻译页面长期显示屏幕分辨率下拉框。

## 6.5 建议涉及文件

- `electron/main/window/manager.ts`
- `electron/main/ocr/windows-ocr.ts`
- `electron/main/ipc/register.ts`
- `electron/shared/types.ts`
- `src/composables/useOcrCapture.ts`
- `src/pages/TranslationPage.vue`
- 新增 OCR 选区窗口页面和样式
- preload 与 API 白名单

---

# 7. 文案统一

| 当前文案 | 建议文案 |
|---|---|
| 处理结果 | 译文 |
| 开始翻译 | 翻译 |
| 开始处理 | 翻译 |
| 处理完成 | 翻译完成 |
| OCR 截图 | 截图识别 |
| OCR 结果 | 识别结果 |
| 正在唤醒模型 | 正在加载模型 / 正在翻译 |
| 译文会在这里流动起来 | 译文将在此显示 |
| 保留段落、代码与换行，不额外发挥 | 保持原文结构，不补充额外内容 |
| 用编辑后的文本翻译 | 填入原文 / 立即翻译 |
| Profile | 翻译场景 |
| AI 翻译 | 译文 |

空状态建议：

```text
译文将在此显示
```

辅助文案：

```text
保持原文结构，不补充额外内容
```

加载状态：

- 模型尚未加载：`正在加载模型`
- 已开始生成：`正在翻译`
- 文档后台任务：`正在处理第 3 / 12 段`

---

# 8. 视觉风格调整

## 8.1 总体方向

从“网页仪表盘”收敛为“桌面效率工具”。

减少：

- 大面积渐变。
- 过强玻璃模糊。
- 多层阴影。
- 过大的圆角。
- 过多空白。
- 偏营销式文案。
- 每个模块都使用独立卡片。

保留：

- 清晰的浅色背景。
- 轻量边框。
- 一致的 8–12px 圆角。
- 主次明确的蓝色强调色。
- 合理的悬停反馈。

## 8.2 推荐尺寸

- 页面主圆角：12px。
- 小控件圆角：8px。
- 面板间距：10–12px。
- 工具栏高度：38–42px。
- 正文字号：13–14px。
- 输入字号：14px。
- 大标题不超过 16px。

## 8.3 左侧导航

建议：

- 默认窗口宽度提高到约 1120px；或
- 将侧栏折叠断点降低到约 820px。
- 为“文档”使用独立文件图标。
- 折叠状态增加 Tooltip。
- 允许用户手动折叠和展开。

---

# 9. 建议代码拆分

```text
src/pages/TranslationPage.vue
src/components/translation/TranslationHeader.vue
src/components/translation/SourceEditor.vue
src/components/translation/TranslationResult.vue
src/components/translation/ResultActions.vue
src/components/translation/TranslationSceneSelector.vue
src/components/ocr/OcrCaptureDialog.vue
src/components/ocr/OcrResultDialog.vue
src/composables/useTranslationSession.ts
src/composables/useOcrCapture.ts
```

职责：

- `TranslationPage`：组合页面，不处理复杂业务。
- `SourceEditor`：输入、粘贴、清空、OCR。
- `TranslationResult`：译文展示和句段联动。
- `ResultActions`：复制译文、复制双语、停止、重试。
- `TranslationSceneSelector`：通用、技术、学术和更多场景。
- `useTranslationSession`：主窗口和悬浮窗共享会话。
- `useOcrCapture`：OCR 状态机，不直接修改页面输入。

---

# 10. 推荐实施顺序

## 第一阶段：删除无效 UI 和调整文案

1. 删除质量检查入口及页面状态。
2. “处理结果”改为“译文”。
3. 复制按钮改为图标。
4. 复制按钮默认隐藏，悬停显示。
5. 删除页面顶部“已复制”Badge。
6. 修正文案。
7. 修复文档与历史图标重复问题。

验收：

- 页面结构明显简化。
- 键盘仍可访问复制按钮。
- 删除质量检查后构建和测试通过。

## 第二阶段：修复长文本布局

1. 为 Segment 增加布局边界信息。
2. 修改分段器保留原文换行和段落边界。
3. 新增统一译文重组函数。
4. 修改 `SegmentedText` 渲染。
5. 修改复制译文和复制双语逻辑。
6. 补充段落、列表、Markdown 和代码测试。

验收：

- 长文本不再一句一行。
- 原文段落结构能够正确保留。
- 句段联动和局部重译仍然可用。

## 第三阶段：悬浮窗 Session

1. 新增 TranslationSession 类型。
2. 新增 Session Store / Manager。
3. 主窗口和悬浮窗订阅同一 Session。
4. Esc 和失焦只隐藏窗口，不清空状态。
5. 点击主窗口恢复当前快速翻译。
6. 支持隐藏后继续接收流式结果。

验收：

- 悬浮窗消失后，结果仍存在。
- 打开主窗口可恢复完整结果。
- 流式翻译不会因窗口隐藏丢失。

## 第四阶段：OCR 重构

1. 截图前隐藏自身窗口。
2. 使用真实或高质量截图。
3. 实现选区裁剪。
4. 裁剪后重新 OCR。
5. OCR 结果增加确认步骤。
6. 支持替换、追加和立即翻译。
7. 移除常驻屏幕选择框。

验收：

- 截图中不包含 LexiFlow 窗口。
- 框选区域和识别区域一致。
- OCR 不再自动覆盖原文。
- 多显示器场景可正常工作。

## 第五阶段：视觉收敛

1. 减少玻璃效果和阴影。
2. 缩小圆角和面板间距。
3. 提高页面信息密度。
4. 调整侧栏折叠规则。
5. 完善悬停和焦点状态。

---

# 11. 测试要求

## 11.1 单元测试

### 文本分段和重组

- 同一段落内多句不强制换行。
- 单换行保留。
- 双换行保留。
- 中文和英文空格规则正确。
- Markdown 列表结构保留。
- 代码块不被拆坏。
- URL、路径和数字不被错误分段。

### Session

- 创建快速翻译 Session。
- 流式事件更新 Session。
- 悬浮窗隐藏不删除 Session。
- 打开主窗口恢复 Session。
- 新快捷翻译替换旧活动请求。
- 过期 requestId 不更新当前 Session。

### OCR

- 截图前隐藏窗口。
- 用户取消时不修改原文。
- 替换原文。
- 追加原文。
- 立即翻译。
- OCR 错误不清空原输入。
- 多显示器默认选择正确。

## 11.2 E2E 测试

### 长文本

```text
输入包含 3 个段落的英文
→ 执行翻译
→ 验证译文保留 3 个段落
→ 验证不是一句一行
→ 复制译文
→ 验证剪贴板结构一致
```

### 悬浮窗恢复

```text
划词并触发快捷翻译
→ 等待部分流式结果
→ 让悬浮窗失焦隐藏
→ 打开主窗口
→ 验证原文和已生成结果已恢复
→ 等待翻译完成
```

### OCR

```text
打开包含文字的窗口
→ 触发截图识别
→ 验证 LexiFlow 不在截图内
→ 框选文字区域
→ 编辑识别文本
→ 点击立即翻译
→ 验证原文和译文正确
```

### 复制操作

```text
完成翻译
→ 验证复制图标默认不可见
→ 鼠标移入译文区域
→ 验证图标显示
→ 点击复制译文
→ 验证图标短暂变为勾选
→ 验证剪贴板内容
```

---

# 12. 构建与验收命令

每个阶段完成后执行：

```bash
pnpm test
pnpm build
pnpm test:e2e
```

Windows 环境补充：

```bash
pnpm dist:win
pnpm dist:win:portable
```

如本地运行 Ollama：

```powershell
$env:LEXIFLOW_E2E_MODEL="qwen3.5:9b"
pnpm exec playwright test
```

---

# 13. Coding Agent 执行要求

1. 修改前先阅读相关文件，不得仅按文档猜测现有结构。
2. 优先小步提交，避免一次性重写整个翻译页。
3. 每个阶段单独提交。
4. 不得破坏当前词典、术语表、局部重译和候选译法功能。
5. 数据结构变更必须考虑历史记录兼容。
6. 新增 IPC 时必须同步：
   - shared 类型。
   - 通道常量。
   - preload 白名单。
   - Renderer API。
   - 运行时参数校验。
7. OCR 临时图片必须继续保证使用后删除。
8. 不得因窗口隐藏而取消仍需继续完成的快速翻译。
9. 所有图标按钮必须有 Tooltip 和可访问性标签。
10. 每完成一个阶段，先运行测试和构建，再继续下一阶段。

---

# 14. 最终验收标准

完成后应达到：

- 翻译主页面结构明显简洁。
- 不再显示质量检查。
- 复制操作不长期占据空间。
- 长文本保持自然段落，而不是一句一行。
- 悬浮窗隐藏后结果不会丢失。
- 主窗口可以恢复最近一次快速翻译。
- OCR 不会截到应用自身。
- OCR 对实际框选区域重新识别。
- OCR 不会未经确认覆盖原文。
- 页面文案统一、直接、准确。
- 视觉风格更接近桌面效率工具。
- 所有现有核心功能和测试保持可用。
