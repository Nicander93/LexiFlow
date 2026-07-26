# LexiFlow V3 后续工作清单

更新日期：2026-07-24  
目标：完成 V3 的发布验收，优先消除数据、隐私和核心翻译流程风险。

## 当前基线

- 已具备：句段结果与联动、局部重译和撤销、候选译法缓存、术语表、Profile、Windows OCR、轻量文档翻译、质量检查、模型路由与本地数据清除。
- 术语表会按源/目标语言筛选命中项；普通翻译和文档翻译均已接入。
- 远程 Provider 需要用户在设置中明确确认；Profile 可禁止把内容发送给远程模型。
- 所有增强模型调用（重译 / 候选 / 词典上下文 / 文档）统一经 `resolveModelAccess`；交互请求优先于文档分块。
- 结构化输出支持一次修复后回退；匿名记录解析失败计数。
- 文档任务单并发队列，失败分块可单独重试；`document-tasks.json` / `profiles.json` 带 schemaVersion。
- OCR 第一阶段限制：选屏 + 预览框选，支持编辑与重新识别；临时 PNG 用后即删。
- 候选译法确认规则：默认 3 个标签（推荐译法 / 直译 / 正式表达）。
- 渲染层曾因 `quality.ts` 中 `URL` 正则盖住全局 `URL` 导致白屏，已改名为 `URL_PATTERN`。

## 验证状态（2026-07-24）

| 项 | 状态 |
|---|---|
| `pnpm test` | 通过 |
| `pnpm build` | 通过 |
| `pnpm test:e2e` | 通过（2 通过，Ollama 真机用例因未设 `LEXIFLOW_E2E_MODEL` 跳过） |
| 打包目录冒烟 | `release/win-unpacked/LexiFlow.exe` E2E 通过 |
| Windows 安装包重打 | `dist:win*` 仍可能因 electron-builder 下载 `ECONNRESET` 失败；仓库内已有既有 Setup/Portable |
| 隐私手工验收 | 清单见 `docs/v3-privacy-acceptance.md` / `docs/v3-acceptance.md` |

## P0：发布阻断项

### 1. 修复并稳定 Electron E2E — 已完成

- [x] Playwright 启动参数加入 GPU 降级
- [x] 启动失败输出窗口 URL / stderr
- [x] `pnpm test:e2e` 在当前 Windows 环境通过

### 2. 生成并安装验证 Windows 包 — 部分完成

- [x] `release/win-unpacked` 可启动（E2E）
- [ ] 网络恢复后重跑 `dist:win` / `dist:win:portable` 覆盖既有产物
- [ ] 干净用户数据目录安装、启动、卸载验证

### 3. 隐私与数据删除手工验收 — 清单已就绪

- [ ] 按 `docs/v3-privacy-acceptance.md` 与 `docs/v3-acceptance.md` 逐项勾选

## P1：功能收尾

### 4–8 — 代码已完成

大文件文档、DPI/多屏 OCR、导入冲突等仍以手工抽检为主，见验收记录。

## P2：交付与可维护性

### 9. 文档、迁移与诊断 — 已完成

见 `docs/architecture.md`、`docs/review-guide.md`、诊断导出 IPC、schemaVersion。

### 10. 发布回归清单 — 见 `docs/v3-acceptance.md`

## 剩余手工项（发布前必须完成）

1. 网络可用时重打 NSIS + portable，并完成安装/卸载验收。
2. 完成隐私验收清单勾选。
3. OCR：100%/125%/150%/200% 与双屏坐标抽检。
4. 文档：大 Markdown / SRT / 暂停恢复取消抽检。
5. （可选）设置 `LEXIFLOW_E2E_MODEL` 跑真实 Ollama 翻译 E2E。
