# LexiFlow V3 发布验收记录

更新日期：2026-07-24  
环境：Windows 10.0.26200 / Node + pnpm / 本机 Electron 43.2.0

## 自动验收

| 项 | 命令 | 结果 | 备注 |
| --- | --- | --- | --- |
| 单元测试 | `pnpm test` | 通过 | 16 文件 / 80 测试；含模型访问校验、结构化校验、文档抢占、脱敏诊断 |
| 构建 | `pnpm build` | 通过 | |
| E2E（开发构建） | `pnpm test:e2e` | 通过 | GPU 降级参数已纳入；Ollama 真机用例未设置 `LEXIFLOW_E2E_MODEL` 时跳过 |
| E2E（打包目录） | `LEXIFLOW_EXECUTABLE=release/win-unpacked/LexiFlow.exe` + Playwright | 通过 | 主窗口、preload、翻译校验、设置路由 |

## 安装包

| 产物 | 路径 | 结果 |
| --- | --- | --- |
| 解包目录 | `release/win-unpacked/LexiFlow.exe` | 可启动（E2E 冒烟通过） |
| Portable | `release/LexiFlow-0.1.0-x64-Portable.exe` | 已有既有产物；本次重跑 `dist:win:portable` 在 electron-builder 下载阶段 `ECONNRESET` |
| NSIS | `release/LexiFlow-0.1.0-x64-Setup.exe` | 已有既有产物；本次重跑 `dist:win` 同样受网络影响 |

网络恢复后需重新执行 `pnpm dist:win` 与 `pnpm dist:win:portable`，并以干净用户数据目录完成安装/卸载手工验收后，方可标记包体验收完成。

## 隐私与数据删除（手工清单）

| 步骤 | 预期 | 结果 |
| --- | --- | --- |
| 首次切换到远程 Provider 并保存 | 弹出确认文案；拒绝后不得保存为可远程请求状态 | 待手工勾选 |
| Profile 勾选禁止远程 | 普通翻译 / 局部重译 / 候选 / 上下文词典 / 文档任务均报错拦截 | 访问校验已统一；待手工勾选 |
| 一键清除本地数据 | 清除历史、词典缓存、术语表、Profile、文档任务和设置 | 待手工勾选 |
| 导出诊断 | 不含原文、译文、文档、API Key | 单测覆盖字段约束；待手工打开导出文件确认 |

## 手工回归（发布前）

- [ ] Ollama 不可用 / 模型不存在 / 请求取消
- [ ] 快速连续触发全局快捷键
- [ ] DPI 100% / 125% / 150% / 200% 与双屏 OCR 坐标
- [ ] 文档暂停 / 恢复 / 取消后不再请求模型
- [ ] OCR 临时 PNG 清理
- [ ] NSIS 安装、升级、卸载（卸载不清除用户未选择清除的数据）
- [ ] Portable 启动

未通过项不得标记 V3 发布完成。
