# ECDICT Notice

LexiFlow 内置英汉词典数据来源于 [ECDICT](https://github.com/skywind3000/ECDICT) 项目。

- 上游仓库：https://github.com/skywind3000/ECDICT
- 上游许可证：请以 ECDICT 仓库当前 LICENSE 为准（常见为 MIT）
- LexiFlow 对原始 CSV 做了筛选、字段裁剪、结构转换与展示层清理，生成只读 SQLite 词库 `ecdict-core.db`
- 本项目不声明 ECDICT 原始词条内容由 LexiFlow 原创
- 正式商业分发前，请再次核对 ECDICT 许可证与再分发边界

如需自行重建词库：

```bash
python scripts/dictionary/build_ecdict.py \
  --input /path/to/ecdict.csv \
  --output resources/dictionaries/ecdict-core.db
```
