# UI/UX VNext Round 2

状态：`completed`  
创建：2026-08-08  
最近更新：2026-08-09

## 背景

上一轮完成无侧栏工作台、History Drawer、Popup VNext 等结构改造后，真实 Windows 使用暴露出：Composer 翻译后消失、Enter 绑定翻译、自动词典 Drawer、Popup ResizeObserver 抖动、History 走路由重建、双层顶栏、模式切换藏在菜单等问题。本轮按 `LexiFlow_UIUX_VNext_Round2_Agent_Plan.md` 纠正交互模型并统一视觉。

## 目标

- Workbench 稳定：Composer 常驻、模式显式、结果内容驱动
- History 真 Overlay；OCR/划词为输入方式；Secondary Shell 可返回
- Popup 可预测（离散高度、临时/固定状态机）
- 工程验证：`pnpm run check` / test / build / e2e 通过

## 范围

### 包含

- Phase 1–6 计划项

### 不包含

- 重写 TranslationEngine / ModelTaskScheduler / Provider
- 多 pinned Popup 窗口池
- 假按钮占位的未来功能

## 任务

- [x] Phase 1：P0 行为 Bug
- [x] Phase 2：Window / Shell
- [x] Phase 3：Workbench 结构收敛
- [x] Phase 4：History / OCR
- [x] Phase 5：Popup 状态机
- [x] Phase 6：视觉统一 + 全量验证
- [x] Round 2.1：移除 Composer 输入框越界焦点描边，低频顶栏与结果 `...` 不再占位
- [x] Round 2.1：设置、工作台、文档等可见路径统一使用项目风格下拉列表，支持键盘与焦点状态
- [x] Round 2.1：OCR 捕获时隐藏主窗口，修复异步截图出现后选区引用未更新的问题
- [x] Round 2.1：OCR 改为轻量全屏框选，空识别给出重新截图入口，成功后仍回填并单次触发翻译
- [x] Round 2.1：Electron 屏幕缩略图为空时使用 Windows GDI 兜底捕获，临时图片始终清理
- [x] Round 2.1：修复 Windows OCR WinRT 类型加载、异步 Await 和图片路径传参，自动匹配失败时回退到系统已安装识别器
- [x] Round 2.1：完成新增交互的视觉截图、全量测试和构建回归

## 验证

- [x] `pnpm run check`（168 passed / 1 native OCR test skipped）
- [x] `pnpm build`
- [x] `pnpm test:e2e`（11 passed / 2 environment-gated skipped）
- [x] `LEXIFLOW_E2E_NATIVE_OCR=1 pnpm test:e2e`（11 passed / 2 skipped；当前代理会话无交互式屏幕句柄，屏幕捕获 smoke 按前置条件跳过）
- [x] `LEXIFLOW_E2E_NATIVE_OCR=1 vitest run tests/ocr-native-engine.test.ts`（真实 PNG 经 Windows OCR 识别通过）
- [x] `git diff --check`

## 风险与回滚

- 风险：Popup 高度策略与 focus 顺序影响划词体验；用离散状态高度替代 ResizeObserver。
- 风险：不同 Windows 桌面会话的 `desktopCapturer` 可用性不同；空缩略图时回退 GDI，并保证临时图片清理。
- 回滚：按 phase 回退对应改动；OCR UI 与捕获/识别后端可分别回退。

## 结果与遗留

- 结果：交互模型与结构重构已落地；App.vue 统一承载 workbench/secondary 顶栏，保持 `router-view` 稳定以免 History/设置切换重建工作台。
- 结果：主输入区越界焦点描边已移除；无必要的 `...` 菜单已撤下；设置与工作区已统一为自绘下拉；Popup 与设置排版统一到暖白/柔绿视觉。
- 结果：OCR 现在隐藏主窗后捕获，以轻量框选层选择区域；Windows OCR 的 WinRT 调用链已由真实图片原生测试证明可用。
- 遗留：当前代理桌面会话没有可捕获的交互式屏幕句柄，无法替代用户机器上的 100%/125% DPI 人工目视确认；自动布局、真实图片识别和环境感知跳过已覆盖。
- 文档：本计划已归档；稳定行为仍以代码为准。
