# 划词翻译按需捕获与剪贴板安全

状态：`active`  
创建：2026-10-18  
最近更新：2026-10-18

## 背景

当前划词流程在检测到一次有效鼠标拖动后，立即调用 `captureSelectedText()`：先把 `__LEXIFLOW_<UUID>__` 写入系统剪贴板，再模拟 `Ctrl+C`，读取选中文字并恢复旧剪贴板。用户尚未点击悬浮 Logo，LexiFlow 就已经修改了剪贴板。

这条路径已经确认存在三个问题：

- 普通拖选也会短暂改写剪贴板，扩大了与用户 `Ctrl+C` 冲突的时间窗口。
- `SelectionMonitor` 的序号只会丢弃过期结果，不会停止已经开始的剪贴板操作；并发捕获可能把另一次捕获的临时标记恢复到剪贴板。
- 恢复逻辑无条件写回旧快照，可能覆盖捕获期间产生的新复制内容；当前快照也只覆盖文本、HTML、RTF 和图片。

产品行为调整为：拖选只显示 Logo，点击 Logo 才读取选区。读取时优先使用 Windows UI Automation；目标控件不支持时才使用剪贴板回退。该方向与 DeepL 的“明确触发后处理”以及 Pot 在 Windows 上采用“Automation API + Clipboard”的混合策略一致。

## 目标

- 用户只拖选文字、未点击 Logo 时，LexiFlow 不读取或修改系统剪贴板，也不调用模型。
- 用户点击 Logo 后才读取选区；优先通过 Windows UI Automation 获取文字，失败时使用剪贴板回退。
- 剪贴板回退不再写入可泄漏的 `__LEXIFLOW_*` 标记，并且同一时刻最多执行一个捕获事务。
- 捕获成功、失败、超时或取消后，剪贴板都处于可解释状态：没有其他更新时恢复捕获前内容；检测到后续更新时保留较新的内容。
- 全局“快速翻译”和“编程命名”快捷键继续作为明确触发入口，并复用同一套安全选区读取服务。
- 保持选中文字只在本机内存和既有翻译链路中流转，不进入日志或诊断导出。

## 范围

### 包含

- 拆分“拖选手势检测”和“选中文字读取”。
- 调整 Selection Logo 的非激活窗口行为与点击确认生命周期。
- 新增 Windows UI Automation 选区读取策略。
- 重写剪贴板回退事务、并发控制和恢复判定。
- 更新相关单元测试、Electron E2E、Windows 人工回归和用户文档。

### 不包含

- 自动翻译每次鼠标选区；用户仍需点击 Logo 或使用明确的全局快捷键。
- 使用 OCR 替代普通文本选区；OCR 只保留为读取失败后的现有替代入口。
- 修改翻译 Provider、prompt、`ModelTaskScheduler`、历史或本地数据 schema。
- 为解决选区读取引入常驻辅助进程或新的大型原生运行时；只有兼容性验证证明现有 Windows 能力不足时，才另行提出依赖变更。

## 方案与影响面

### 1. 拖选阶段只建立待确认状态

- `SelectionMonitor` 只判断左键拖动距离、LexiFlow 自身窗口焦点和坐标，不再调用文本捕获函数。
- `SelectionController` 保存一次待确认的选区位置和生命周期状态，而不是提前保存选中文字。
- 新一次拖选、右键取消、五秒超时、关闭开关或应用退出都会使旧待确认状态失效。
- 没有读取文字就无法确认拖动对象一定是文本，因此拖动滚动条、文件或画布时可能短暂显示 Logo。这个假阳性优先于无条件干扰剪贴板，并通过最小拖动距离、目标窗口排除和短超时控制。

### 2. 点击 Logo 后才捕获

- Selection Logo 使用真正不可激活的 Windows 窗口行为；点击不得把前台焦点从原应用转移到 LexiFlow。现有 `showInactive()` 保留，并验证 `focusable: false` 或等效方案在 Windows 上仍能可靠接收点击。
- 点击确认进入单次 `capturing` 状态；重复点击合并为同一任务，新的拖选或停用操作使旧结果失效。
- 捕获完成前不显示可聚焦的翻译窗。成功后再打开快速翻译窗；失败时打开现有手动输入状态并给出可操作错误。
- 现有 `selection:tip-trigger`、`PopupPayload.capturing` 和弹窗工作流优先复用；若最终需要修改共享契约，必须同步 channels、共享 API、preload、IPC registrar 和浏览器预览适配器。

### 3. UI Automation 优先，剪贴板回退

- 在主进程建立一个窄接口，例如 `SelectionTextReader.read(maxLength)`，由组合层注入并供 Logo、快速翻译、编程命名和现有 `selection:capture` 入口共同使用。
- Windows 首选策略通过 UI Automation 的 `TextPattern.GetSelection()` 读取当前聚焦控件的选区。先采用项目已有的 PowerShell/Windows COM 能力完成最小实现，避免立即增加原生 Node 依赖。
- UI Automation 返回非空文字时不得访问剪贴板；不支持 TextPattern、选区为空、权限不匹配或超时时才进入剪贴板回退。
- UI Automation 与剪贴板错误只返回脱敏错误类别，不记录选中文字、剪贴板内容或目标窗口正文。
- 在实现前先用 Notepad、Edge/Chrome 和 VS Code 验证 UI Automation 覆盖率与延迟；若 PowerShell 启动延迟或焦点语义不满足要求，在继续实现前记录证据并重新评估 Windows 原生辅助层，而不是静默降低行为保证。

### 4. 无标记、可串行化的剪贴板事务

- 删除预写 `__LEXIFLOW_*` 标记的做法。使用 Windows `GetClipboardSequenceNumber()` 判断模拟 `Ctrl+C` 后剪贴板是否真正发生变化，即使新旧纯文本相同也能识别复制事件。
- 用进程内互斥/队列串行化所有选区捕获；Logo、快速翻译和编程命名不能并发操作剪贴板。
- 事务顺序为：保存原剪贴板和序列号 → 模拟一次复制 → 等待序列号变化 → 读取文字 → 再次确认序列号 → 有条件恢复。
- 只有剪贴板仍处于本次捕获产生的版本时才恢复快照；如果读取后又出现更新，则保留较新的内容，避免覆盖用户随后的 `Ctrl+C`。
- 快照和恢复至少覆盖当前 Electron 版本能够往返的文本、HTML、RTF、图片、文件列表与原生自定义格式。若 Electron 43 的公开接口无法完整恢复某类格式，改用受控的 Windows STA/OLE helper；不得把“只恢复纯文本”作为完成状态。
- 复制失败、超时或异常不得清空剪贴板；恢复失败要返回明确错误，但不得把快照内容写入日志。

### 5. 现有边界

- 选区读取继续只在 Electron 主进程发生，Renderer 不获得 Node、PowerShell、UI Automation 或任意剪贴板访问能力。
- 本工作不新增模型调用路径；成功捕获后的翻译仍经过现有 `resolveModelAccess()`、`requestId`、取消和 `ModelTaskScheduler`。
- 不新增设置字段或本地持久化结构。现有“启用划词翻译”仍控制鼠标监听；“暂停全部快捷键”仍只控制全局快捷键。

## 任务

- [x] 建立失败基线：覆盖拖选即访问剪贴板、并发捕获可能交错恢复，以及恢复覆盖较新剪贴板内容的可重复测试。
- [ ] 完成 Windows 技术验证：确认不可激活 Logo 点击时原应用仍保持焦点和选区，并记录 UI Automation 在 Notepad、Edge/Chrome、VS Code 中的成功率与延迟。
- [x] 把 `SelectionMonitor` 改为纯手势/坐标检测，证明拖选和 Logo 自动消失期间没有任何剪贴板调用。
- [x] 为 `SelectionController` 建立 `idle → pending → capturing → completed/dismissed` 生命周期，处理重复点击、换选区、关闭开关、超时和退出。
- [x] 建立统一 `SelectionTextReader`，实现 UI Automation 优先、剪贴板回退和最大长度校验。
- [x] 重写剪贴板回退：移除 marker，使用序列号、串行队列、条件恢复和完整格式快照。
- [x] 让 Selection Logo、快速翻译、编程命名和 `selection:capture` 复用同一个 reader，删除重复或绕过安全事务的调用。
- [x] 更新 `docs/architecture.md`、`docs/user-guide.md`、`docs/troubleshooting.md` 和相关审查说明；合并时保留这些文件中已有的用户改动。
- [ ] 完成全部自动化和 Windows 人工验收后，把本计划移入 `completed/`，填写结果、遗留和实际兼容性边界，并更新计划索引。

## 验证

### 自动化

- [x] 单元测试：拖选不调用 reader；点击只调用一次；重复点击合并；旧选区结果被丢弃；停用与退出清理状态。
- [x] 单元测试：UI Automation 成功时不访问剪贴板；不支持或空选区时才回退；超长文本和错误归一化保持现有行为。
- [x] 单元测试：多个捕获请求严格串行；复制未改变序列号时保持原剪贴板；捕获后无外部更新时恢复；出现较新序列号时不覆盖。
- [x] 单元测试：文本、HTML、RTF、图片、文件列表和至少一种自定义格式的快照往返；任何路径都不会留下 `__LEXIFLOW_*`。真实 WinForms 往返需设置 `LEXIFLOW_WINDOWS_CLIPBOARD=1`；CI 与默认 `pnpm test` 只跑内存快照与算法测试。
- [ ] Electron E2E：Logo 显示和点击不激活 LexiFlow；捕获期间显示正确状态；成功、失败和手动输入路径可用。
- [x] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e`
- [ ] `pnpm check`
- [ ] `git diff --check`

验证记录：

- 2026-10-18：完成第一增量。拖选只建立待确认状态，点击后才调用现有捕获函数；重复确认合并，取消、超时、停用和退出使旧结果失效；Selection Logo 配置为 `focusable: false`，真实 Windows 点击与焦点行为仍待技术验证。目标测试 8 项、完整单元测试 202 项通过（另 1 项跳过），`pnpm typecheck`、`pnpm build` 和构建契约验证通过。
- 2026-10-18：完成第二增量。`SelectionTextReader` 统一 Logo / 快捷键 / `selection:capture` 入口；Windows 优先 UI Automation，失败才进入无标记剪贴板回退。回退按 `GetClipboardSequenceNumber()` 确认复制，并用 WinForms `DataObject` 快照往返文本、HTML、RTF、图片、文件列表和自定义格式；仅当序列号仍属于本次捕获时恢复。复制超时和恢复失败返回明确错误，不再误报为空选区。删除 `__LEXIFLOW_*` 标记路径。探查结果：WinForms 快照往返上述格式成功。Logo 不可激活点击与 Notepad/Edge/VS Code 的 UI Automation 覆盖率仍待真实应用验证。目标相关测试通过；完整单元测试 215 项通过（另 1 项跳过），`pnpm typecheck` 通过。
- 2026-10-18：GitHub-hosted Windows runner 没有可用剪贴板会话，真实往返测试会阻塞到 15 秒超时。该测试改为 `LEXIFLOW_WINDOWS_CLIPBOARD=1` 时才运行，格式恢复仍由 `clipboard-capture` 内存快照覆盖。

### Windows 人工回归

- [ ] 分别在 Notepad、Edge/Chrome、VS Code、Word（可用时）和常用 PDF 阅读器中验证拖选、点击 Logo、快捷键捕获和失败回退。
- [ ] 只拖选不点击时，验证剪贴板序列号和内容不变化；随后手动 `Ctrl+C` 能正常复制。
- [ ] 点击 Logo 成功翻译后，验证原有纯文本、富文本、图片和资源管理器文件复制仍可正常粘贴。
- [ ] 快速连续拖选、重复点击、点击后立即复制其他内容，确认不会出现 `__LEXIFLOW_*`、旧内容回写或重复翻译。
- [ ] 在目标应用与 LexiFlow 权限等级不同的情况下验证明确失败提示，不把失败误报为无选区。
- [ ] 在 100%、125%、150%、200% 缩放和多屏环境验证 Logo 位置与不可激活点击。

## 风险与回滚

- 风险：不在拖选时预读文字会让非文本拖动也可能显示 Logo。通过拖动阈值、外部窗口判断、短超时和点击后校验控制，不以恢复旧的“提前改剪贴板”行为解决。
- 风险：部分自绘控件、PDF 阅读器或高权限应用不支持 UI Automation。保留受控剪贴板回退和现有 OCR/手动输入入口。
- 风险：不可激活 Electron 窗口在不同 Windows 版本、DPI 或输入设备上的点击行为可能不同。第一阶段先做真实 Windows 验证；未通过前不继续依赖该假设扩展实现。
- 风险：任意 Windows 剪贴板格式的完整恢复可能超出 Electron 43 高层 API。以文件复制和自定义格式的往返测试作为决策门槛，必要时使用窄范围 Windows helper。
- 回滚：按“手势与点击生命周期”“UI Automation reader”“剪贴板回退”三个独立提交交付；发生兼容性问题时可回退对应阶段，不修改设置、历史或其他用户数据。

## 结果与遗留

- 结果：待实施后填写。
- 遗留：待 Windows 兼容性矩阵完成后填写。
- 文档：计划完成时更新架构、用户指南、故障排查与计划索引。
