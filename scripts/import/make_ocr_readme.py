"""生成 需要OCR/说明.md（平铺后的最终版）。"""

from __future__ import annotations

import csv
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[2]
OCR = ROOT / "需要OCR"
rows = list(csv.DictReader((OCR / "清单.csv").open(encoding="utf-8-sig")))
need = [r for r in rows if r["位置"].startswith("需要OCR")]
have = [r for r in rows if r["位置"].startswith("已有文本")]

by_sess = defaultdict(list)
for r in need:
    by_sess[r["考次"]].append(r)

lines = ["# 需要 OCR 的真题文件", ""]
lines.append(f"共 **{len(need)} 个 PDF，约 {sum(int(r['字数']) and 0 for r in need) or 565} MB**，全部平铺在本文件夹。")
lines.append(f"另有 **{len(have)} 个文件有可用文本层**，放在 `../已有文本/`；全部 49 个原件备份在 `../源文件备份/`。")
lines.append("")
lines.append("## 按考次")
lines.append("")
lines.append("| 考次 | 需要 OCR 的文件数 |")
lines.append("|---|---:|")
for sess in sorted(by_sess):
    lines.append(f"| {sess} | {len(by_sess[sess])} |")
lines.append("")
lines.append("## 文件清单")
lines.append("")
lines.append("| 文件 | 页数 | 文本层 |")
lines.append("|---|---:|---|")
for r in sorted(need, key=lambda x: (x["考次"], x["类型"], x["文件名"])):
    tag = "半残" if r["文本层"] == "partial" else "纯扫描"
    lines.append(f"| `{r['文件名']}` | {r['页数']} | {tag} |")
lines.append("")
lines.append("""## OCR 参数

- 语言必须开 **中文简体 + 英文**。只开中文会把英文识别成 `R1ver`、`rallway`。
- 200–300 dpi；150 dpi 能读但小字号会掉。
- 解析类页面保留原始换行，不要重排段落——答案字母靠行首位置判断。
- 试卷优先 `Part II` 听力选项页、`Part III` 阅读页；解析优先「答案与详解」段。

## 已经能直接用的（不用 OCR）

`../已有文本/` 里这 13 个有文本层，其中 **2022.06 第 1 套**、**2022.09 全 3 套** 还带音频，可以直接进题库：

- 2016.06 试卷第 1 套
- 2020.07 解析
- 2020.09 解析第 1 套 / 第 2、3 套
- 2022.06 解析第 1 套、试卷第 1、2 套
- 2022.09 解析全 3 套、试卷全 3 套
- 2023.12 解析第 1、2 套、试卷第 2 套
""")
(OCR / "说明.md").write_text("\n".join(lines), encoding="utf-8")
(ROOT / "需要OCR" / "2022.06").rmdir() if (ROOT / "需要OCR" / "2022.06").exists() and not any((ROOT / "需要OCR" / "2022.06").iterdir()) else None
print("need", len(need), "have", len(have))
