# 代码与架构重构

状态：`active`
创建：2026-08-07
最近更新：2026-08-08

## 背景

依据 `docs/LexiFlow_代码与架构重构任务书.md`，当前代码仍存在设置全量快照覆盖、IPC 注册集中且校验不完整、交互模型请求共享单一活动请求、文档与交互翻译管线重复、OCR 先整屏识别、页面承担过多流程状态等问题。当前工作树中的文档、截图与浏览器预览改动属于既有用户工作，本计划不覆盖或回退这些改动。

## 目标

- 完成任务书阶段 0–8 及 Definition of Done 的全部代码、测试和文档交付。
- 保持 Electron 主进程、preload 与 Renderer 的安全边界，保持现有用户数据和 IPC channel 字符串兼容。
- 最终通过 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:e2e`，并记录 Windows 人工回归结果。

## 范围

### 包含

- P0 正确性修复与回归测试。
- SettingsService、领域 IPC 契约/注册器、TranslationEngine 与请求 lane、Document 服务、两阶段 OCR、Renderer 页面拆分、存储恢复和工程约束。
- 与最终代码一致的架构、开发、审查及操作文档。

### 不包含

- 新产品功能、视觉改版、IPC channel 字符串的不兼容变更。
- Pinia、RxJS、IoC 容器等与任务无关的重量依赖。

## 方案与影响面

- 采用任务书建议的“小步替换”：先以测试锁定行为，再建立新接口和适配层，切换调用方后删除旧路径。
- 主进程业务用例不持有 Renderer UI 对象；系统能力继续只经 preload 白名单暴露。
- 设置写入改为主进程串行命令，API Key 始终只在 `safeStorage` 路径处理。
- 交互请求使用 `RequestCoordinator` 管理业务 lane；文档分块已通过可独立测试的 `TranslationEngine` 复用访问校验、清理、Profile、术语和结构化分段，并由 `ModelTaskScheduler` 调度。

## 任务

- [x] 阶段 0：建立 P0、OCR 坐标和 IPC 非法输入基线测试。
- [x] 阶段 1：修复导航、弹窗尺寸持久化风暴和高风险 IPC 校验。
- [x] 阶段 2：引入 SettingsService，切换所有设置写入口和 Renderer settings state。
- [x] 阶段 3：建立 shared contracts 的实际领域定义、统一 DTO 校验和按领域 registrar；`register-all` 负责组合，旧 `ipc/register.ts` 仅保留兼容导出。registrar 不直接触碰 Provider、Store、文件系统或 Electron 对话框。
- [x] 阶段 4：提取 TranslationEngine，bootstrap 将同一实例注入主窗口、弹窗与文档分块，并统一 stream state reducer、Provider factory 和 RequestCoordinator lanes。
- [x] 阶段 5：拆分文档导入/导出服务、任务队列和分块翻译 worker，并复用 TranslationEngine。
- [x] 阶段 6：实现先框选后识别的 OCR 流程、取消、超时和结构化错误；Renderer OCR 交互收敛到 `OcrWorkspace`。
- [x] 阶段 7：拆分翻译状态、OCR、复制反馈、词典抽屉、句段操作和历史会话入口，移除核心 CustomEvent/sessionStorage 命令；页面仅负责布局组合，工作流进入 `useTranslationWorkspace` / `usePopupWorkflow`。
- [x] 阶段 8：存储损坏恢复、所有持久化 store 的结构校验、lint/格式/边界检查和架构/开发/审查文档更新。
- [ ] Definition of Done 的 Windows 托盘、快捷键实际触发/占用回滚、多屏/DPI、真实 OCR 语言包和安装版人工回归。

## 验证记录

- 2026-08-07：初始 `pnpm test` 通过，27 个文件、132 个测试；`typecheck/build` 因未跟踪的 `tsconfig.web.tsbuildinfo` 写入发生 Windows `EPERM`，待清理生成缓存后复验。
- 2026-08-08：新增 16 个回归测试，当前 35 个测试文件、148 个测试通过；`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build` 和 `pnpm test:e2e` 通过（4 个 E2E 通过，真实 Ollama 测试按环境变量跳过）。
- 2026-08-08：新增 `OcrWorkspace`、`DictionaryDrawer` 和 `SegmentActionPopover` 后，最新 `pnpm test` 仍为 35/148，最新 `pnpm build` 与 `pnpm test:e2e` 仍通过（4 通过、1 个 Ollama 用例跳过）。
- 2026-08-08：补齐 settings/history/profiles/documents/glossary 的 JSON schema 校验和备份策略，新增历史会话链路与 schema 损坏隔离测试；`pnpm check` 通过（36 个测试文件、150 个测试），`pnpm test:e2e` 通过（4 通过、1 个 Ollama 用例跳过），构建契约验证通过。
- 2026-08-08：E2E 增加隔离 userData、历史会话打开和本地数据清理，源码 `pnpm test:e2e` 为 7 个用例（6 通过、1 个 Ollama 用例跳过）；当前源码目录版、NSIS 解包版和 Portable 解包版均通过同一组 6 个自动用例。
- 2026-08-08：修复 startup/快捷键副作用边界，弹窗尺寸、托盘暂停、清理数据统一进入 `SettingsUseCases`；新增设置副作用测试，当前 `pnpm check` 为 36 个测试文件、151 个测试通过。
- 2026-08-08：E2E 新增 API Key 脱敏与 settings JSON 明文检查；最新源码 `pnpm test:e2e` 为 8 个用例（7 通过、1 个 Ollama 用例跳过）。
- 2026-08-08：补齐 Electron E2E 的弹窗自动布局无设置写入、快捷键注册失败回滚、真实运行进程快捷键注册和本地清理文档任务覆盖；最新源码 `pnpm test:e2e` 为 12 个用例（10 通过、OCR smoke 与 Ollama 各 1 个按环境跳过）。
- 2026-08-08：使用当前 NSIS 安装器在工作区隔离目录完成静默安装，并让安装目录中的 `LexiFlow.exe` 通过同一组 10 项 Electron E2E（9 通过、1 个 Ollama 用例跳过）。
- 2026-08-08：NSIS 安装目录和 Portable 解包目录均通过最新 12 项 Electron E2E（各 10 通过、OCR smoke 与 Ollama 各 1 个按环境跳过），包括真实运行进程快捷键注册检查。
- 2026-08-08：新增托盘菜单创建、暂停开关、双击打开、设置/退出动作及重复更新不重复创建实例的单元测试；当前测试基线增至 37 个文件、153 个测试。
- 2026-08-08：最新 `pnpm check` 通过：类型检查、架构边界、格式检查、37 个测试文件/153 个测试和构建契约全部通过。
- 2026-08-08：源码 E2E 直接验证主进程 `globalShortcut.isRegistered()`；当前运行环境的三个配置快捷键均已注册。显式 OCR smoke 诊断到唯一屏幕源 `screen:0:0` 在 1×1、320×180、1920×1080 和当前物理尺寸请求下均返回空缩略图（0×0），随后得到 `OCR_CAPTURE_FAILED`“无法捕获屏幕内容”；移除 GPU 参数又无法创建主窗口，真实 OCR 仍需目标桌面环境。
- 2026-08-08：E2E 在 safeStorage 可用时验证 settings 中 API Key 为密文且可由 Electron 解密回原值；仍未替代跨进程重启后的人工持久化验收。
- 2026-08-08：因当前沙箱对全局 pnpm store 目录无写权限，临时复制 store 索引到工作区后成功生成当前源码的目录版、NSIS 安装器和 Portable；目录版、NSIS 解包目录和 Portable 解包目录均通过 4 项 E2E（各 1 个 Ollama 用例按环境跳过），原始 pnpm 生成配置已恢复。
- 2026-08-08：早期打包尝试曾受到旧产物文件锁和 electron-builder 依赖树 SQLite 权限错误影响；当前版本已通过工作区索引 workaround 重新生成并完成解包目录 E2E。托盘实际交互、快捷键实际触发/外部占用回滚、多屏 DPI、Windows OCR、Portable 外壳和 safeStorage 重启持久化仍需目标环境执行。

## 风险与回滚

- 设置与 IPC 跨越 main/preload/Renderer，必须以兼容适配器分步切换，避免旧页面与新主进程契约错配。
- OCR 依赖 Windows 运行时和语言包；自动测试只能覆盖坐标、裁剪和状态流，最终仍需真实 Windows 回归。
- 每阶段保持可独立验证；发生回归时回退该阶段的新调用入口，不删除用户数据或历史 migration。

## Windows 人工验收清单

- [ ] 启动 `release/win-unpacked/LexiFlow.exe`，确认托盘图标、双击打开主窗口和退出菜单。
- [ ] 在系统中注册翻译、命名、截图快捷键，分别验证触发、暂停、占用失败后的旧快捷键恢复。
- [ ] 在双显示器和高 DPI 缩放下验证划词提示、弹窗定位和主窗口导航。
- [ ] 在已安装 Windows OCR 语言包的环境中完成“截图 → 框选 → 识别”，验证取消、超时和临时文件清理。
- [ ] 验证 NSIS 安装版和 Portable 启动、safeStorage API Key 保存与清理。
