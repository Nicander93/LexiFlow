# LexiFlow

LexiFlow 是面向 Windows 的本地优先桌面翻译工具，支持划词快捷翻译、技术翻译、编程命名、流式输出和本地历史。

审查入口：[代码审查指南](docs/review-guide.md) · [架构说明](docs/architecture.md) · [故障排查](docs/troubleshooting.md)

## 能力概览

### 基础（v0.1）

- 系统托盘常驻，关闭主窗口可隐藏到托盘
- 全局快捷键读取当前选中文字，恢复原剪贴板
- 鼠标附近的多显示器悬浮窗，可固定、拖动、缩放和 Esc 关闭
- 普通翻译、技术翻译和结构化编程命名
- Ollama 与 OpenAI-compatible Provider
- 流式输出、AbortController 取消、旧请求隔离
- 模型健康检查、模型列表、可编辑模型名和提示词
- 本地设置与最近历史，API Key 使用 Electron `safeStorage` 加密
- Windows 开机启动、快捷键修改和暂停

### V2 / V3（在基础之上）

- 稳定句段切分、局部重译、候选译法（推荐 / 直译 / 正式）
- 术语表、翻译 Profile（含禁止远程）、本地 ECDICT 词典（单词优先，AI 按需）与上下文解释
- Windows OCR（选屏 + 预览框选，临时图用后即删）
- 轻量文档翻译（TXT / Markdown / SRT / 文本 PDF / 代码预览），单并发队列
- 远程 Provider 需用户确认；一键清除本地数据；脱敏诊断导出

## 开发环境

- Node.js 22.12+ 或 24
- pnpm 11+
- Windows 10/11，或用于构建的 WSL 2
- 本地模型场景需自行安装并启动 Ollama

```bash
pnpm install
pnpm dev
```

WSL 中运行开发模式需要可用的 WSLg；桌面能力的最终验证应在 Windows 安装包中完成。

## 测试与构建

```bash
pnpm test
pnpm build
pnpm test:e2e
pnpm dist:win
```

Windows NSIS 安装包输出到 `release/`。若只需要免安装程序：

```bash
pnpm dist:win:portable
```

打包脚本默认使用 npmmirror 加速 Electron 二进制下载；下载仍失败时见 [故障排查](docs/troubleshooting.md)。

如本机已运行 Ollama，可执行包含真实模型请求的端到端验证：

```powershell
$env:LEXIFLOW_E2E_MODEL="qwen3.5:9b"
pnpm exec playwright test
```

## 本地词典

- 词库来自 ECDICT 精简 SQLite（`resources/dictionaries/ecdict-core.db`），随安装包 `extraResources` 分发。
- 重建：`python scripts/dictionary/build_ecdict.py --input /path/to/ecdict.csv|stardict.db --output resources/dictionaries/ecdict-core.db`
- 主窗口输入英文单词/短语会自动查词；悬浮窗命中词典时默认不调用模型。
- 详见 `resources/dictionaries/NOTICE.md`。

## 构建边界

- 主进程使用 ESM，入口为 `dist-electron/main/index.js`。
- preload 强制使用 CommonJS，入口为 `dist-electron/preload/index.cjs`，以兼容 sandbox renderer。
- 渲染进程保持 `contextIsolation: true`、`nodeIntegration: false` 与 `sandbox: true`。
- `pnpm build` 会执行构建契约检查，模块格式或资源路径错误会直接失败。
- 普通 TypeScript 使用原生 TypeScript 7；Vue SFC 暂由 `@typescript/typescript6` 提供兼容检查，桥接集中在 `scripts/vue-typecheck.cjs`。

## 首次使用

1. 启动 Ollama，并确保已拉取模型，例如 `ollama pull qwen3.5:9b`。
2. 打开托盘菜单中的“设置”，确认地址和模型名称，点击“保存并测试连接”。
3. 在其他 Windows 应用中选中文字，按 `Ctrl + Alt + T` 快速翻译。
4. 若快捷键冲突，在设置中自行修改组合键。

默认设置目录由 Electron 管理，通常位于 `%APPDATA%/LexiFlow`。历史记录不会上传；切换远程 Provider 后，输入内容会发送到相应服务。

## 安全边界

渲染进程启用 `contextIsolation` 与 sandbox，禁用 Node.js。所有系统能力只通过 preload 白名单 IPC 暴露，渲染进程不能执行任意命令。API Key 不进入普通 JSON 配置和日志。

更多问题见 [故障排查](docs/troubleshooting.md)、[架构说明](docs/architecture.md) 与 [代码审查指南](docs/review-guide.md)。
