"""生成 需要OCR/说明.md（解析 + 试卷两部分）。"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
OCR = ROOT / "需要OCR"

ans_rows = list(csv.DictReader((OCR / "清单.csv").open(encoding="utf-8-sig")))
paper_rows = json.loads((ROOT / "work" / "papers_status.json").read_text(encoding="utf-8"))

need_ans = [r for r in ans_rows if r["位置"].startswith("需要OCR")]
need_paper = [r for r in paper_rows if r["文本层"] != "text"]
paper_counts = Counter(r["文本层"] for r in paper_rows)

lines = ["# 需要 OCR 的文件", ""]
lines.append("## 目录")
lines.append("")
lines.append("```")
lines.append("需要OCR/")
lines.append("├── *.pdf                 # 36 份解析（扫描/乱码），平铺")
lines.append("├── 试卷/                  # 23 份试卷（扫描/半残），平铺")
lines.append("├── 清单.csv               # 解析清单")
lines.append("├── 试卷清单.csv           # 73 份试卷的文本层检测结果")
lines.append("└── 说明.md")
lines.append("```")
lines.append("")
lines.append(f"## 试卷（{len(paper_rows)} 份检测：text {paper_counts.get('text',0)} / partial {paper_counts.get('partial',0)} / image {paper_counts.get('image',0)}）")
lines.append("")
lines.append(f"`试卷/` 里是其中 **{len(need_paper)} 份**需要 OCR 的：")
lines.append("")
lines.append("| 文件 | 页数 | 判定 |")
lines.append("|---|---:|---|")
for r in sorted(need_paper, key=lambda x: (x["考次"], x["文件"])):
    tag = "半残" if r["文本层"] == "partial" else "纯扫描"
    lines.append(f"| `{r['考次']}-{r['文件']}` | {r['页数']} | {tag} |")
lines.append("")
lines.append(f"其余 **{paper_counts.get('text',0)} 份**有完整文本层，不需要 OCR。")
lines.append("")
lines.append(f"## 解析（{len(need_ans)} 份）")
lines.append("")
lines.append("| 文件 | 页数 | 判定 |")
lines.append("|---|---:|---|")
for r in sorted(need_ans, key=lambda x: (x["考次"], x["类型"], x["文件名"])):
    tag = "半残" if r["文本层"] == "partial" else "纯扫描"
    lines.append(f"| `{r['文件名']}` | {r['页数']} | {tag} |")
lines.append("")
lines.append("""## OCR 参数

- 语言必须开 **中文简体 + 英文**。只开中文会把英文识别成 `R1ver`、`rallway`。
- 200–300 dpi。
- 解析类页面保留原始换行——答案字母靠行首位置判断。
- 试卷优先 `Part II` 听力选项页、`Part III` 阅读页。

## 特别说明

- **2015.06 第 1 套**的试卷文本层能抽出来，但**选词填空的词库在 PDF 里丢了**（正文结束直接进 Section B），需要 OCR 那一页补回 15 个选项。
- 类似情况还有 2015.12 / 2016.06：文本层存在，但个别区块缺失或用了 `[A]` 式段落标记，导入时要单独适配。
""")
(OCR / "说明.md").write_text("\n".join(lines), encoding="utf-8")
print("need_ans", len(need_ans), "need_paper", len(need_paper), paper_counts)
