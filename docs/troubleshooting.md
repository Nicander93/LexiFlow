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

先运行 `pnpm build` 排除代码错误。WSL 交叉构建需要能够下载 Electron 与 electron-builder 工具；项目路径建议放在 WSL 文件系统而非 `/mnt/c`。若 NSIS 交叉构建受环境限制，也可在 Windows PowerShell 中运行 `pnpm install --frozen-lockfile` 和 `pnpm dist:win`。

### Electron 二进制下载超时 / 很慢

`electron-builder` 默认从 GitHub 拉取 Electron zip，国内常会超时。项目已默认走 npmmirror：

- `package.json` → `build.electronDownload.mirror`
- `scripts/dist-win.mjs` → `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` / `CSC_IDENTITY_AUTO_DISCOVERY=false`

也可手动覆盖：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
pnpm dist:win:portable
# 或安装包
pnpm dist:win
```

若本机已有 HTTP 代理（如 Clash），也可改用代理而不是镜像：

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
pnpm dist:win:portable
```

超时后建议清掉不完整缓存再重试：删除 `%LOCALAPPDATA%\electron\Cache` 与 `%LOCALAPPDATA%\electron-builder\Cache` 中对应版本目录。

## 本地词典不可用

界面提示“本地词典资源不可用”时：

1. 确认安装包 / 开发目录中存在 `resources/dictionaries/ecdict-core.db`（打包后位于 `resources/dictionaries/`）。
2. 开发模式不要依赖当前工作目录相对路径；主进程通过 `app.getAppPath()` / `process.resourcesPath` 定位。
3. 词库损坏不影响翻译：可继续使用 AI 翻译；修复后重启应用即可。
4. 自行重建：

```bash
python scripts/dictionary/build_ecdict.py --input /path/to/stardict.db --output resources/dictionaries/ecdict-core.db
```
