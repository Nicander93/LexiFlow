# LexiFlow 故障排查

## 划词后没有出现提示

1. 在设置页确认“启用划词翻译”已开启。设置会自动保存，无需额外点击按钮。
2. 完成拖选后松开鼠标；提示会出现在选区下方，而不是屏幕底部。
3. 尝试普通文本页面。部分应用使用自绘文本、禁止复制，或以管理员权限运行，无法被普通权限进程读取。
4. 若目标应用以管理员身份运行，LexiFlow 也需要相同权限。
5. 检查是否有安全软件拦截全局鼠标钩子。

提示出现但点击无效时，先确认选区仍存在。点击页面、滚动或重新选择会使旧提示失效，这是为了避免翻译过期内容。

## 提示位置不正确

划词提示按显示器 DIP 坐标定位。若位置明显偏移：

- 在 Windows 显示设置中确认每块屏幕的缩放比例。
- 分别在 100%、125%、150% 和 200% 缩放下复现。
- 多屏环境记录目标屏幕的排列和缩放比例。
- 重启应用，排除显示设置变更后的旧坐标状态。

## 未检测到选中文字

LexiFlow 通过模拟复制读取选区。目标应用不支持标准复制、剪贴板被占用或权限等级不同都会导致失败。可改用快速翻译窗口手动输入，或使用截图 OCR。

## 全局快捷键注册失败

快捷键可能被 Windows 或其他应用占用。在设置页改用其他 Electron accelerator 格式的组合键。修改会自动保存并重新注册；若仍失败，完全退出冲突应用后重试。

## Ollama 无法连接

- 确认 Ollama 已启动，默认地址为 `http://127.0.0.1:11434`。
- 确认设置中的模型名称已在 Ollama 中安装。
- 在设置页执行连接测试。
- 若从 WSL 调试 Windows 上的 Ollama，`127.0.0.1` 是否可达取决于 WSL 网络模式，可改用 Windows 主机地址。

## 远程 Provider 被拒绝

首次使用远程 Provider 需要明确确认数据会发送到远程服务。Profile 禁止远程访问时，即使全局已确认也会被拦截。API Key 必须从设置页录入，应用不会把它写入普通设置文件。

## 本地词典不可用

确认开发目录或安装包资源中存在 `resources/dictionaries/ecdict-core.db`。开发和生产分别通过应用路径与 `process.resourcesPath` 定位，不能依赖启动时工作目录。词典故障不影响 AI 翻译。

重建词典：

```powershell
python scripts/dictionary/build_ecdict.py --input C:\path\to\stardict.db --output resources/dictionaries/ecdict-core.db
```

## 原生依赖安装或启动失败

划词监听依赖 `uiohook-napi`。切换 Node/Electron 版本后应重新安装依赖，确保原生模块与当前 Electron ABI 匹配：

```powershell
pnpm install --frozen-lockfile
pnpm build
```

不要把其他机器生成的 `node_modules` 或原生 `.node` 文件直接复制到当前环境。

## Windows 打包失败

先运行 `pnpm build` 排除代码和构建契约错误，再运行：

```powershell
pnpm dist:win
# 或
pnpm dist:win:portable
```

项目默认配置 Electron 镜像。网络受限时可设置 `ELECTRON_MIRROR`、`ELECTRON_BUILDER_BINARIES_MIRROR`，或配置 `HTTP_PROXY` 和 `HTTPS_PROXY`。超时后应只清理对应版本的不完整 Electron/electron-builder 缓存，再重试。

## 提交问题时附带什么

- 操作系统版本、显示器数量与缩放比例
- LexiFlow 版本和目标应用名称
- 可复现步骤与预期/实际行为
- 已脱敏的诊断导出

不要附带 API Key、原文、译文、文档正文或包含敏感内容的截图。