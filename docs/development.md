# LexiFlow 开发指南

## 环境

- Windows 10/11
- Node.js 22.12+ 或 24
- pnpm 11+
- 本地模型联调需自行安装 Ollama

```powershell
pnpm install
pnpm dev
```

## 目录结构

```text
electron/
  main/
    bootstrap/       应用装配
    core/            无 Electron UI 依赖的核心逻辑
    dictionary/      ECDICT 只读查询
    document/        文档导入、分块与任务队列
    ipc/             IPC 注册与发送方校验
    ocr/             Windows OCR
    provider/        Ollama / OpenAI-compatible
    selection/       全局划词监听、控制器与原生适配器
    storage/         本地 JSON 与 safeStorage
    translation/     交互翻译编排与 Session
    tray/            系统托盘
    window/          BrowserWindow 生命周期
  preload/           contextBridge 白名单
  shared/            主进程与渲染进程共享的契约和纯逻辑
src/
  components/        跨功能共享 UI
  features/
    dictionary/      词典 UI、查询状态与发音
    ocr/             OCR 渲染状态
    settings/        设置页局部 UI
    translation/     翻译状态、句段与结果 UI
  pages/             路由页面与页面级编排
  platform/          preload 获取与浏览器预览适配器
  router/            路由
  styles/            token、基础、布局、页面和弹窗样式
tests/               单元、模块和 Electron E2E
resources/           随安装包分发的词典资源
scripts/             构建、打包、图标和词典脚本
```

`dist/`、`dist-electron/`、`release/`、`test-results/` 和 `*.tsbuildinfo` 均为生成物，不得提交。品牌源图只保留 `src/assets/logo.png`；`build/icon.*` 由 `scripts/generate-icon.py` 生成。

## 模块约束

- Electron 主进程负责系统能力和模型调用；Vue 渲染进程不得直接访问 Node.js。
- 新系统能力必须同步修改：
  1. `electron/shared/types.ts` 中的 `IPC_CHANNELS`
  2. `electron/shared/api.ts` 中的 `TranslatorApi`
  3. `electron/preload/index.ts` 白名单
  4. `electron/main/ipc/register.ts` handler
  5. `src/platform/translator.ts` 浏览器预览适配器
- 所有会发送用户内容的模型调用必须经过 `resolveModelAccess()`，使用独立 `requestId`，可取消，并丢弃过期事件。
- 交互翻译和后台文档任务统一经过 `ModelTaskScheduler`，交互任务优先。
- API Key 只能经 `safeStorage` 持久化。

## 常用命令

```powershell
pnpm test
pnpm build
pnpm test:e2e
pnpm dist:win
pnpm dist:win:portable
```

真实 Ollama E2E：

```powershell
$env:LEXIFLOW_E2E_MODEL="qwen3.5:9b"
pnpm exec playwright test
```

打包产物冒烟：

```powershell
$env:LEXIFLOW_EXECUTABLE="release/win-unpacked/LexiFlow.exe"
pnpm exec playwright test
```

## 修改检查清单

- 新 IPC 是否完成五处契约同步并校验可信发送方。
- 新模型路径是否经过访问校验、调度器、取消和 requestId 过滤。
- 设置字段是否包含默认值、验证、迁移和清除逻辑。
- 结构化输出字段是否同步 prompt、验证器、UI、测试和 `PROMPT_VERSION`。
- 新本地文件是否进入隐私清除和诊断脱敏检查。
- 删除模块后是否同步移除重复测试、过期文档和无效样式。
- 提交前至少运行 `pnpm test` 与 `pnpm build`。
