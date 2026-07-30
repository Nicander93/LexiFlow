# LexiFlow

LexiFlow 是面向 Windows 的本地优先桌面翻译工具，支持划词提示、技术翻译、编程命名、本地词典、OCR、文档翻译、流式输出和本地历史。

## 主要能力

- 系统托盘常驻与可配置全局快捷键
- 选中文字后在选区下方显示小型翻译 Logo
- Ollama 与 OpenAI-compatible Provider
- Profile、术语表、句段对照、局部重译与候选译法
- 本地 ECDICT 词典与按需上下文解释
- Windows OCR 与轻量文档翻译
- 自动保存设置、本地历史、收藏与脱敏诊断
- API Key 使用 Electron `safeStorage` 加密

## 开发

要求 Node.js 22.12+ 或 24、pnpm 11+ 和 Windows 10/11。

```powershell
pnpm install
pnpm dev
```

提交前至少运行：

```powershell
pnpm test
pnpm build
```

Electron 端到端测试与 Windows 打包：

```powershell
pnpm test:e2e
pnpm dist:win
pnpm dist:win:portable
```

安装包输出到 `release/`。本地模型联调需自行安装并启动 Ollama。

## 项目结构

- `electron/main/`：系统能力、Provider、模型编排、存储与窗口
- `electron/preload/`：渲染进程白名单桥
- `electron/shared/`：共享类型、IPC 通道和纯逻辑
- `src/features/`：按翻译、词典、OCR、设置归组的渲染功能
- `src/pages/`：路由页面与页面级编排
- `resources/`：随安装包分发的本地词典资源
- `tests/`：单元、模块与 Electron E2E

完整说明见 [文档索引](docs/README.md)。

## 使用入口

- [用户指南](docs/user-guide.md)
- [故障排查](docs/troubleshooting.md)
- [架构说明](docs/architecture.md)
- [开发指南](docs/development.md)
- [发布检查清单](docs/release-checklist.md)

## 安全约束

渲染进程启用 `contextIsolation`，禁用 Node.js。所有系统能力经 preload 白名单 IPC 暴露。任何发送用户内容的模型调用必须支持取消、校验 `requestId`，并经过 `resolveModelAccess()`。远程 Provider 需用户确认，Profile 可禁止远程发送。

默认数据目录通常为 `%APPDATA%/LexiFlow`。本地历史不会上传；使用远程 Provider 时，待处理内容会发送到用户配置的服务。