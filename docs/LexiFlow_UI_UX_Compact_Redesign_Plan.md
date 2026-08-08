# LexiFlow UI/UX 紧凑化与设置页重构执行方案

> 适用仓库：`Nicander93/LexiFlow`
> 目标分支：基于当前 `main` 分支实施
> 执行对象：Coding Agent
> 文档性质：可直接执行的 UI/UX 改造任务书

---

## 1. 任务目标

对 LexiFlow 当前主窗口与设置页进行一次完整的 UI/UX 紧凑化改造，使产品呈现以下特征：

- 极简、克制、桌面工具化
- 信息密度更高，但不拥挤
- 字体、图标、间距、圆角明显缩小
- 主窗口整体尺寸接近有道词典桌面版的紧凑感
- 划词、OCR、快捷键等高频功能更容易找到
- 设置页改为“左侧分类导航 + 右侧设置内容”
- 快捷键支持点击后直接按键录入
- 快捷键注册失败时，不得保存无效配置
- 避免全局深度监听导致的频繁自动保存

本任务不是简单调整几个 CSS 数值，而是一次围绕“尺寸、层级、导航、配置交互”的系统性重构。

---

## 2. 当前仓库重点文件

执行前先阅读以下文件，确认当前实现与依赖关系：

```text
src/App.vue
src/components/AppSidebar.vue
src/components/PageHeader.vue
src/pages/TranslationPage.vue
src/pages/SettingsPage.vue

src/features/settings/SettingsSection.vue

src/styles/tokens.css
src/styles/base.css
src/styles/layout.css
src/styles/components.css
src/styles/pages.css
src/styles/popup.css
src/styles/selection-tip.css

electron/shared/defaults.ts
electron/shared/types.ts
electron/main/core/settings-validation.ts
electron/main/hotkey/manager.ts
electron/main/ipc/register.ts
electron/main/storage/settings.ts
electron/main/window/manager.ts
```

当前需要重点注意：

- 主窗口默认尺寸约为 `960 × 780`
- 主侧栏宽度约为 `200px`
- 页面大量使用大圆角、阴影、毛玻璃和渐变
- 设置页所有配置纵向堆叠在一个页面
- 快捷键目前使用普通文本框编辑
- 设置页对整个 `settings` 对象进行深度监听，并在 600ms 后自动保存
- 设置保存流程当前是先写配置，再调用快捷键注册
- 划词翻译能力已存在，实际语义是“选中文字后显示翻译按钮”，不是鼠标悬停取词

---

## 3. 设计原则

### 3.1 极简而不是空旷

减少装饰层级，但保持清晰的信息分组。

必须减少：

- 大面积渐变背景
- 噪点纹理
- 普通卡片阴影
- 多层毛玻璃
- 过大的品牌区
- 冗余英文副标题
- 大尺寸圆角
- 无必要的说明文案

应主要使用：

- 纯色背景
- 细分隔线
- 轻量 hover
- 统一间距
- 低饱和蓝色强调
- 扁平设置行

### 3.2 视觉层级不超过三层

建议固定为：

1. 页面背景
2. 内容区域
3. 真正的浮层：Toast、Popover、悬浮翻译窗、下拉菜单

普通设置区块不应再通过“大卡片 + 大标题 + 图标块 + 阴影”建立层级。

### 3.3 高频入口前置

侧栏应直接提供：

- 翻译
- 命名
- 历史
- 文档
- 截图 OCR
- 划词翻译开关
- 设置

低频高级配置进入设置页内部。

---

## 4. 全局视觉规范

在 `src/styles/tokens.css` 中统一调整设计 Token，其他样式尽量引用变量，避免散落魔法数字。

### 4.1 颜色

建议：

```css
:root {
  --app-bg: #f5f6f8;
  --surface: #ffffff;
  --surface-hover: #f7f8fa;
  --surface-active: #eef4ff;

  --ink: #20242c;
  --ink-soft: #4f5663;
  --muted: #8a919e;

  --border: #e7e9ee;
  --border-strong: #d9dde5;

  --accent: #3b73e8;
  --accent-hover: #2f64d4;
  --accent-soft: #edf3ff;

  --danger: #d9485f;
  --warning: #ad6b1f;
  --success: #2d805d;
}
```

要求：

- 删除 `body` 的径向渐变和噪点背景
- `surface` 默认不使用 `backdrop-filter`
- 普通内容区域不使用明显阴影
- 仅浮层保留轻阴影

### 4.2 圆角

建议统一为：

```css
--radius-xs: 4px;
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 10px;
--radius-xl: 12px;
```

禁止普通设置卡片继续使用 20–26px 圆角。

### 4.3 阴影

```css
--shadow-float: 0 8px 24px rgba(31, 38, 52, 0.12);
--shadow-subtle: 0 1px 3px rgba(31, 38, 52, 0.05);
```

普通卡片默认不加阴影。

### 4.4 字体

保留系统字体栈：

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI Variable",
  "Segoe UI",
  "PingFang SC",
  "Microsoft YaHei",
  sans-serif;
```

尺寸规范：

| 场景 | 字号 |
|---|---:|
| 页面标题 | 15px |
| 设置分组标题 | 14px |
| 导航文字 | 12–13px |
| 表单标签 | 12px |
| 正文 | 13px |
| 翻译正文 | 14px |
| 辅助说明 | 11px |
| 词典词头 | 18px |
| 标签、Badge | 10–11px |

不要全局将字体压缩到难以阅读。重点缩小的是导航、设置控件和图标。

### 4.5 控件尺寸

| 控件 | 目标尺寸 |
|---|---:|
| 普通输入框 | 30–32px 高 |
| 按钮 | 30–32px 高 |
| 图标按钮 | 28–30px |
| 导航项 | 36–38px |
| Switch | 34 × 20px |
| 设置行 | 44–48px |

---

## 5. 主窗口尺寸与整体布局

修改 `electron/main/window/manager.ts`。

建议：

```ts
width: 960,
height: 680,
minWidth: 760,
minHeight: 560,
```

注意：

- 不要继续缩小宽度，避免翻译区过窄
- 主要压缩高度和内部垂直间距
- 保留窗口尺寸可调整能力
- 不修改快速翻译悬浮窗的独立尺寸逻辑，除非紧凑化过程中发现明显冲突

---

## 6. 主侧栏重构

修改：

```text
src/components/AppSidebar.vue
src/styles/layout.css
```

### 6.1 目标结构

```text
[Logo] LexiFlow

翻译
命名
历史
文档

────────────

截图 OCR
划词翻译        [开关]

────────────

设置
关于
```

### 6.2 具体要求

#### 品牌区

- 侧栏宽度调整为 `156–164px`
- Logo 调整为 `28px`
- 只显示 `LexiFlow`
- 删除“安静地读懂每一句”
- 删除 Logo 阴影或改为极轻阴影
- 品牌区总高度不超过 48px

#### 导航项

- 删除英文副标题：`Translate`、`Naming` 等
- 删除右侧箭头
- 图标尺寸调整为 16px
- 图标容器调整为 26px
- 导航项高度控制在 36–38px
- 激活态采用浅蓝背景和蓝色文字
- hover 不要横向位移，不要明显阴影
- 保持键盘焦点样式

#### 快速工具区

新增侧栏工具项：

1. 截图 OCR
   - 点击后进入翻译页
   - 触发当前 OCR 捕获流程
   - 复用现有 `ocrCaptureRequested` 或已有窗口 API
   - 不重复实现 OCR

2. 划词翻译开关
   - 绑定 `settings.shortcuts.enableSelectionTranslation`
   - 切换后立即保存
   - 文案必须使用“划词翻译”
   - 不使用“取词”，因为当前并非鼠标悬停取词

可选增加：

- “暂停快捷键”入口，可放在设置页，不强制放侧栏

#### 底部区域

删除当前较大的“本地优先”卡片。

可改为：

```text
● 本地优先
```

或仅显示一个小状态图标，悬停 Tooltip：

```text
文本由当前选择的模型服务处理
```

---

## 7. 翻译页紧凑化

修改：

```text
src/pages/TranslationPage.vue
src/styles/pages.css
src/styles/components.css
```

### 7.1 页面头部

当前头部包含：

- 页面标题
- Profile 快捷切换
- 目标语言
- Profile 下拉
- Provider 状态

调整为一行紧凑布局：

```text
[通用][技术][学术]    目标语言 [自动]   Profile [通用翻译]   ● 本地模型
```

要求：

- 可以隐藏“翻译”页面大标题，或将其缩小后与控制区合并
- 头部总高度不超过 40px
- 下拉框高度 28–30px
- 状态 Badge 更小
- 不使用大块卡片背景

### 7.2 原文输入区

要求：

- 输入区圆角调整为 10–12px
- 输入文字保持 14–15px
- Toolbar 高度从约 42px 压缩到 34–36px
- 输入区默认最小高度保持可用，但减少 footer 高度
- OCR、清空使用图标按钮
- 清空按钮默认弱化或 hover 时出现
- 主要翻译按钮保持明确，但尺寸压缩到 30–32px

### 7.3 结果区域

要求：

- 词典 / AI 翻译切换改为紧凑 Tab
- 词典词头从 22px 缩小为 18px
- 翻译正文使用 14px、1.65 左右行高
- 复制按钮使用图标，并保持 hover/focus 时出现的当前思路
- 减少结果区域内部 16–20px 的大间距
- 局部重译 Popover 保留浮层属性，不要塞回普通文档流

### 7.4 不修改的功能行为

本任务不改变：

- 翻译请求协议
- 流式输出逻辑
- 句段对齐机制
- 本地词典逻辑
- OCR 识别能力
- Profile 行为
- 术语校验逻辑

仅调整布局、入口与视觉密度。

---

## 8. 设置页信息架构重构

当前 `SettingsPage.vue` 内容过长，需要拆分。

### 8.1 新目录结构

建议调整为：

```text
src/features/settings/
├─ SettingsLayout.vue
├─ SettingsNav.vue
├─ ShortcutRecorder.vue
├─ useSettingsForm.ts
├─ types.ts
└─ sections/
   ├─ GeneralSettings.vue
   ├─ SelectionSettings.vue
   ├─ TranslationSettings.vue
   ├─ ProviderSettings.vue
   ├─ DictionarySettings.vue
   └─ AdvancedSettings.vue
```

`src/pages/SettingsPage.vue` 只负责：

- 读取设置
- 提供共享状态
- 维护当前分类
- 展示 Toast 和错误
- 调用保存方法
- 组合 `SettingsLayout`

不要继续把所有模板写在单个页面中。

### 8.2 页面布局

设置页采用二级侧栏：

```text
┌──────────────┬────────────────────────────────┐
│ 常规         │ 标题                           │
│ 划词与快捷键 │ 当前分类说明                   │
│ 翻译         │                                │
│ 模型服务     │ 设置内容                       │
│ 词典与术语   │                                │
│ 高级         │                                │
└──────────────┴────────────────────────────────┘
```

建议尺寸：

- 设置页分类侧栏：150–170px
- 右侧内容最大宽度：760–820px
- 设置页不再使用多个大卡片
- 分类导航吸顶或固定在内容区左侧
- 当前分类 URL 不强制拆路由，可先使用局部状态
- 用户重新打开设置页时默认进入“常规”

### 8.3 分类内容

#### 常规

- Windows 登录时启动
- 关闭主窗口时：
  - 隐藏到托盘
  - 退出应用
- 悬浮窗失焦自动隐藏
- 保存本地历史
- 最大历史数量
- 历史保留周期

#### 划词与快捷键

- 启用划词翻译
- 暂停全部快捷键
- 快速翻译快捷键
- 编程命名快捷键
- 截图 OCR 快捷键
- 快速翻译默认 Profile

说明文案：

```text
启用划词翻译
选中文字后显示悬浮翻译按钮
```

#### 翻译

- 默认目标语言
- 最大输入长度
- 翻译前自动清理文本
- 保留原始换行
- 保护 Markdown 代码块

依赖关系：

- 未启用“自动清理文本”时：
  - “保留原始换行”
  - “保护 Markdown 代码块”
  应保持禁用状态

#### 模型服务

基础区域：

- Provider
- Base URL
- 模型名称
- API Key
- 启用 Reasoning
- 请求超时
- 模型常驻时间
- 保存并测试连接

模型路由放在折叠区域：

```text
高级模型路由
```

默认折叠，包含：

- 启用自动模型路由
- 短文本阈值
- 短文本模型
- 文档模型

#### 词典与术语

包含：

- 术语表
- CSV 导入导出
- Translation Profile

建议使用局部 Tab：

```text
[术语表] [翻译 Profile]
```

不要让术语表和 Profile 同时纵向展开。

#### 高级

包含：

- 高级提示词
- 导出诊断
- 清除本地数据

高级提示词默认折叠。

“清除所有本地数据”置于页面底部危险区域，使用红色文字按钮或弱化边框按钮，不使用大面积红色背景。

---

## 9. 设置行组件规范

建议新增通用组件：

```text
src/features/settings/components/SettingRow.vue
src/features/settings/components/SettingGroup.vue
```

### 9.1 SettingRow

支持以下结构：

```vue
<SettingRow
  title="启用划词翻译"
  description="选中文字后显示悬浮翻译按钮"
>
  <Switch v-model="..." />
</SettingRow>
```

目标样式：

- 高度：最小 44px
- 上下 padding：8–10px
- 标题：12–13px
- 说明：11px
- 右侧控件宽度稳定
- 相邻设置行用 `border-bottom`
- 最后一行无分隔线

### 9.2 SettingGroup

结构：

```text
分组标题
可选说明
设置行列表
```

不要再使用大图标块。

---

## 10. 快捷键录入组件

新增：

```text
src/features/settings/ShortcutRecorder.vue
```

### 10.1 交互要求

默认显示：

```text
Ctrl + Alt + T
```

点击后进入录制状态：

```text
请按下快捷键
```

用户按键后：

- 捕获 `keydown`
- 阻止默认行为
- 组合修饰键与主键
- 转换为 Electron Accelerator 字符串
- 立即进行本地冲突检查
- 通过后触发保存
- 失败时恢复原值

支持：

- `Escape`：取消录制
- `Backspace` / `Delete`：清空
- 点击组件外：取消录制
- 单独修饰键：不保存
- `Tab`：保留键盘导航，不录制
- 输入状态有明显焦点样式
- 显示当前录制状态

### 10.2 支持的修饰键

Windows 下统一映射：

| 浏览器键 | Accelerator |
|---|---|
| Ctrl | `Ctrl` |
| Alt | `Alt` |
| Shift | `Shift` |
| Meta | `Super` |

建议至少要求一个修饰键。

不允许：

- 仅字母
- 仅数字
- 单独 Ctrl / Alt / Shift
- 与其他 LexiFlow 快捷键重复

### 10.3 按键映射

需要处理常见情况：

```text
KeyA → A
Digit1 → 1
F1 → F1
Space → Space
Enter → Enter
ArrowUp → Up
ArrowDown → Down
ArrowLeft → Left
ArrowRight → Right
Escape → Escape
```

不要直接依赖 `event.key` 的本地化字符结果。优先根据 `event.code` 转换。

### 10.4 显示格式与存储格式

存储格式：

```text
Ctrl+Alt+T
```

显示格式：

```text
Ctrl + Alt + T
```

建议提取共享工具：

```text
electron/shared/shortcut.ts
```

包含：

```ts
normalizeShortcut()
formatShortcutForDisplay()
parseKeyboardEvent()
isValidShortcut()
findShortcutConflict()
```

渲染进程和主进程尽量共享相同规则。

---

## 11. 快捷键保存事务修复

当前流程存在问题：

```text
先保存设置
再注册快捷键
```

如果快捷键被占用，无效配置仍可能写入本地。

必须改为“验证和注册成功后再持久化”。

### 11.1 目标流程

```text
读取旧设置
    ↓
校验新设置
    ↓
尝试注册新快捷键
    ↓
成功：
  保存新设置
  保持新注册
失败：
  恢复旧快捷键注册
  不保存新设置
  返回具体错误
```

### 11.2 建议实现方式

在 `electron/main/hotkey/manager.ts` 中增加事务方法，例如：

```ts
apply(next: ShortcutSettings, previous: ShortcutSettings): ShortcutRegistrationResult
```

或：

```ts
tryRegister(settings: ShortcutSettings): ShortcutRegistrationResult
restore(settings: ShortcutSettings): void
```

在 `electron/main/ipc/register.ts` 的设置更新处理器中调整：

```ts
const previous = settingsStore.get();
const errors = validateSettings(next);

if (errors.length) {
  throw new Error(errors.join("\n"));
}

const shortcutResult = hotkeyManager.tryApply(
  next.shortcuts,
  previous.shortcuts
);

if (shortcutResult.errors.length) {
  throw new Error(shortcutResult.errors.join("\n"));
}

try {
  const updated = await settingsStore.update(next);
  await historyStore.prune(updated.history);
  return { settings: updated, shortcutResult };
} catch (error) {
  hotkeyManager.restore(previous.shortcuts);
  throw error;
}
```

具体实现可根据当前依赖注入结构调整，但必须满足：

- 注册失败不写配置
- 写配置失败恢复旧快捷键
- 不能出现所有快捷键被意外注销后未恢复的状态
- 更新时避免短暂触发旧回调和新回调混乱

### 11.3 额外校验

在 `settings-validation.ts` 中补充：

- 快捷键标准格式
- 至少一个修饰键
- 三个快捷键不可重复
- 空快捷键的处理应与“功能开关”一致

注意：

- 如果“划词翻译”关闭，快速翻译快捷键是否仍可用需保持当前产品语义一致
- 当前代码中 `enableSelectionTranslation` 同时影响快捷翻译快捷键注册，这个逻辑需要重新确认
- 建议将“划词翻译开关”和“快速翻译快捷键”解耦：
  - 划词开关只控制选区悬浮按钮
  - 快速翻译快捷键仍可独立使用
- 如调整该行为，需要同步修改测试和文档

推荐采用解耦方案。

---

## 12. 设置保存策略重构

删除当前对整个 `settings` 的深度监听自动保存：

```ts
watch(settings, scheduleAutoSave, { deep: true });
```

不要继续使用统一 600ms 自动保存所有字段。

### 12.1 分类保存策略

#### 立即保存

适用于：

- Switch
- 单选
- 下拉框
- 关闭行为
- 历史保留周期

行为：

- 用户变更后立即保存
- 成功后不必频繁弹 Toast
- 失败时恢复旧值，并显示错误

#### 失焦保存

适用于：

- 最大输入长度
- 最大历史数量
- 请求超时
- 模型常驻时间
- 路由阈值

行为：

- `blur` 时保存
- Enter 时保存并失焦
- 保存前校验

#### 显式保存

适用于：

- Provider 配置
- API Key
- 模型服务
- 高级提示词
- 术语表
- Translation Profile

Provider 保留：

```text
保存并测试连接
```

高级提示词保留独立保存按钮。

### 12.2 useSettingsForm

建议在：

```text
src/features/settings/useSettingsForm.ts
```

封装：

```ts
loadSettings()
updateField()
updateSection()
saveProvider()
saveShortcut()
rollback()
setMessage()
```

要求：

- 保存过程中防止重复提交
- 保留最后成功保存快照
- 保存失败能够回滚
- API Key 不写入普通响应状态
- 不使用多个组件各自重复调用完整设置更新逻辑

---

## 13. 开关组件调整

当前 `.ios-switch` 尺寸偏大。

调整为：

```css
width: 34px;
height: 20px;
```

圆点：

```css
width: 16px;
height: 16px;
top: 2px;
left: 2px;
```

选中位移：

```css
transform: translateX(14px);
```

要求：

- 整个开关区域可点击
- 不将 `pointer-events: none` 用在导致可访问性问题的位置
- 支持 `:focus-visible`
- 提供 `aria-label` 或关联 label

---

## 14. 文案调整

统一文案，减少技术暴露。

### 推荐文案

| 当前或可能文案 | 修改后 |
|---|---|
| Provider | 模型服务类型 |
| Base URL | 服务地址 |
| OpenAI-compatible | OpenAI 兼容服务 |
| Enable Reasoning | 启用推理模式 |
| Translation Profile | 翻译配置 |
| screenshot OCR | 截图 OCR |
| selection translation | 划词翻译 |
| 使用 Electron accelerator 格式 | 删除，不再让用户手动输入 |
| 暂停快捷键 | 暂停全部快捷键 |

保留专业词汇的场景：

- API Key
- Ollama
- Profile 可以在高级或开发者场景中保留，但主标签优先显示“翻译配置”

---

## 15. 响应式行为

主窗口最小宽度下：

- 主侧栏可缩为 56–64px 图标栏
- 隐藏侧栏文字
- Tooltip 显示功能名称
- 设置页二级侧栏不应直接消失
- 可改为顶部分类 Tab 或下拉菜单

断点建议：

```css
@media (max-width: 920px)
@media (max-width: 760px)
```

要求：

- 760px 时页面仍可正常配置
- 不出现横向滚动
- 设置控件可换行
- 危险操作按钮不与普通按钮拥挤在一行

---

## 16. 可访问性要求

必须满足：

- 所有图标按钮都有 `title` 和 `aria-label`
- 快捷键录制组件可通过键盘聚焦
- Switch 可通过 Space 切换
- 分类导航使用 button 或可访问链接
- 当前分类使用 `aria-current`
- 错误消息使用 `aria-live="polite"`
- Toast 不抢焦点
- 焦点样式不可删除
- 颜色不是唯一状态提示
- 禁用状态要有可读的视觉差异

---

## 17. 测试要求

### 17.1 单元测试

为以下逻辑补充测试：

```text
normalizeShortcut
formatShortcutForDisplay
parseKeyboardEvent
isValidShortcut
findShortcutConflict
```

覆盖：

- Ctrl+Alt+T
- Ctrl+Shift+S
- F8
- Space
- 单独修饰键
- 重复快捷键
- 非法快捷键
- Escape 取消
- Delete 清空

### 17.2 主进程测试

补充快捷键事务测试：

1. 新快捷键注册成功，保存成功
2. 新快捷键注册失败，旧设置不变
3. 新快捷键注册成功，但配置写入失败，旧快捷键恢复
4. 三个快捷键重复时拒绝保存
5. 暂停全部快捷键时取消注册
6. 恢复快捷键时重新注册

如 Electron `globalShortcut` 难以直接测试，抽象注册适配器并注入 mock。

### 17.3 组件测试

至少覆盖：

- 点击快捷键组件进入录制
- 按下组合键生成正确值
- Escape 取消
- 点击外部取消
- 冲突时显示错误
- 设置分类切换
- Switch 变更后调用保存
- 保存失败回滚

### 17.4 E2E 手工验收

Windows 上验证：

- 主窗口首次打开尺寸正确
- 侧栏导航可用
- 侧栏 OCR 可触发
- 划词翻译开关生效
- 快捷键可直接按键录入
- 被其他应用占用的快捷键不会保存
- 重启应用后配置保持正确
- 所有设置分类可访问
- 调整窗口大小后布局正常
- 主题切换如当前未实现，不在本任务中新增

---

## 18. 验收标准

完成后必须满足以下标准。

### 视觉

- 主界面明显比当前版本紧凑
- 侧栏宽度不超过 164px
- 普通圆角不超过 12px
- 普通设置区块无明显阴影
- 设置页不再纵向堆叠所有模块
- 设置页字体与控件尺寸接近桌面工具，而非网页后台
- 词典标题、图标、导航项明显缩小

### 交互

- 划词和 OCR 可从侧栏快速访问
- 设置页可按分类快速定位
- 快捷键通过实际按键输入
- 快捷键录制支持取消和清除
- 快捷键冲突立即提示
- 无效快捷键绝不写入配置
- 设置失败时界面值能够回滚

### 工程

- `SettingsPage.vue` 不再承担所有业务
- 不再深度监听整个设置对象自动保存
- 快捷键格式化逻辑集中管理
- 主进程快捷键更新具备事务性
- 原有翻译、词典、OCR、历史和 Profile 功能不回退
- TypeScript 类型检查通过
- 单元测试通过
- 构建通过

---

## 19. 建议实施顺序

### 阶段一：视觉 Token 与主布局

1. 修改 `tokens.css`
2. 移除全局渐变、噪点和毛玻璃
3. 压缩圆角、间距、按钮和控件
4. 调整主窗口默认高度
5. 重构主侧栏

完成后先截图对比。

### 阶段二：设置页布局拆分

1. 创建 `SettingsLayout`
2. 创建 `SettingsNav`
3. 创建六个设置分类组件
4. 将现有设置内容迁移
5. 保持功能不变
6. 删除旧 `SettingsSection` 或将其降级为轻量 `SettingGroup`

### 阶段三：快捷键录制

1. 建立共享快捷键工具
2. 实现 `ShortcutRecorder`
3. 接入设置页
4. 增加本地冲突校验
5. 增加组件测试

### 阶段四：保存机制与事务

1. 删除深度自动保存
2. 新建 `useSettingsForm`
3. 分类保存策略
4. 修改主进程设置更新流程
5. 快捷键失败回滚
6. 补充主进程测试

### 阶段五：翻译页紧凑化与回归

1. 压缩 TranslationPage
2. 压缩词典卡片
3. 调整图标和 Toolbar
4. 完整回归 OCR、翻译、词典、历史、局部重译

---

## 20. 非目标

本任务不要顺便实现以下内容：

- 真正的鼠标悬停取词
- 新 OCR 引擎
- 新模型 Provider
- 云端同步
- 登录和会员系统
- 全新主题系统
- 全面重写翻译页业务逻辑
- 引入大型 UI 组件库
- 引入 Tailwind 等全新样式框架
- 改动词典数据格式
- 改动翻译结果结构化协议

优先在现有 Vue + CSS 架构内完成。

---

## 21. Agent 执行要求

执行时遵循：

1. 先阅读代码，不要只根据本文直接覆盖实现。
2. 保留现有功能，优先小步重构。
3. 每完成一个阶段运行：
   ```bash
   pnpm typecheck
   pnpm test
   ```
4. 最终运行：
   ```bash
   pnpm build
   ```
5. 有条件时运行：
   ```bash
   pnpm test:e2e
   ```
6. 不要生成临时样式补丁堆积在文件末尾。
7. 不要通过大量 `!important` 解决层级问题。
8. 不要保留已废弃组件和重复样式。
9. 修改后同步更新必要文档。
10. 最终输出：
    - 修改文件列表
    - 关键设计决策
    - 测试结果
    - 尚未完成事项
    - 视觉截图或预览说明

---

## 22. 最终交付清单

```text
[ ] 全局设计 Token 紧凑化
[ ] 主窗口默认高度调整
[ ] 主侧栏重构
[ ] 侧栏增加截图 OCR
[ ] 侧栏增加划词翻译开关
[ ] 翻译页尺寸压缩
[ ] 设置页二级侧栏布局
[ ] 设置内容拆分为独立组件
[ ] 快捷键录制组件
[ ] 快捷键共享格式化工具
[ ] 快捷键冲突检测
[ ] 快捷键事务保存
[ ] 删除全局深度自动保存
[ ] 设置失败回滚
[ ] 单元测试
[ ] 组件测试
[ ] 主进程测试
[ ] TypeScript 检查通过
[ ] 构建通过
[ ] Windows 手工回归
```
