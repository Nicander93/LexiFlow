# 故障排查

## Ollama 无法连接

确认 Ollama 已启动，默认地址是 `http://127.0.0.1:11434`。在设置页保存后执行连接测试，并确认模型名称存在。

## WSL 中访问 Windows Ollama

最终应用运行在 Windows，无需 WSL 网络转发。仅在 WSL 开发模式调试时，`127.0.0.1` 的可达性取决于 WSL 网络模式，可改填 Windows 主机地址。

## 全局快捷键注册失败

快捷键可能被 Windows 或其他应用占用。进入设置改为 `Ctrl+Alt+T`、`Ctrl+Alt+N` 等组合。托盘菜单可以临时暂停快捷键。

## 未检测到选中文字

部分高权限应用不允许普通权限进程模拟复制；也有应用不支持标准 Ctrl+C。可在悬浮窗出现的输入框中手动粘贴。若目标应用以管理员身份运行，LexiFlow 也需要相同权限。

## Windows 打包失败

先运行 `npm run build` 排除代码错误。WSL 交叉构建需要能够下载 Electron 与 electron-builder 工具；项目路径建议放在 WSL 文件系统而非 `/mnt/c`。若 NSIS 交叉构建受环境限制，也可在 Windows PowerShell 中运行 `npm ci` 和 `npm run dist:win`。
