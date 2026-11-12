"""根据 work/scan_status.json 重写 OCR 清单和说明。"""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OCR = ROOT / "需要OCR"
status = json.loads((ROOT / "work" / "scan_status.json").read_text(encoding="utf-8"))

text_files = [r for r in status if r["verdict"] == "text"]
partial = [r for r in status if r["verdict"] == "partial"]
image = [r for r in status if r["verdict"] == "image"]

rows = []
for r in status:
    rel = r["file"].replace("\\", "/")
    sess = rel.split("/")[0]
    kind = "解析" if "/解析-" in "/" + rel else "试卷"
    name = rel.split("/", 1)[1]
    for prefix in ("解析-", "试卷-"):
        if name.startswith(prefix):
            name = name[len(prefix):]
    rows.append(
        {
            "考次": sess,
            "类型": kind,
            "文件名": name,
            "页数": r["pages"],
            "文本层": r["verdict"],
            "字数": r["chars"],
            "中文字数": r["cjk"],
            "本地路径": "需要OCR/remote/" + rel,
        }
    )
rows.sort(key=lambda x: (x["考次"], x["类型"], x["文件名"]))
with open(OCR / "待OCR清单.csv", "w", encoding="utf-8-sig", newline="") as fh:
    writer = csv.DictWriter(
        fh,
        fieldnames=["考次", "类型", "文件名", "页数", "文本层", "字数", "中文字数", "本地路径"],
    )
    writer.writeheader()
    writer.writerows(rows)

lines = []
lines.append("# 需要 OCR 的文件\n")
lines.append("更新时间：2026-11-12\n")
lines.append(f"总量：**{len(status)} 个 PDF，约 809 MB**，位于 `remote/`，按考次分文件夹。\n")
lines.append("## 先说结论：13 个文件根本不用 OCR\n")
lines.append("| 文件 | 页数 | 字数 | 说明 |")
lines.append("|---|---:|---:|---|")
for r in sorted(text_files, key=lambda x: x["file"]):
    lines.append(f"| `{r['file']}` | {r['pages']} | {r['chars']} | 有文本层，可直接解析 |")
lines.append("\n## 真正需要 OCR 的（32 个纯扫描 + 4 个半残）\n")
lines.append("| 文件 | 页数 | 文本 | 判定 |")
lines.append("|---|---:|---|---|")
for r in sorted(partial + image, key=lambda x: x["file"]):
    tag = "半残" if r["verdict"] == "partial" else "纯扫描"
    lines.append(f"| `{r['file']}` | {r['pages']} | {r['chars']} 字符 | {tag} |")
lines.append(
    """

## OCR 参数建议

- 语言必须开 **中文简体 + 英文**。只开中文会把英文识别成 `R1ver`、`rallway`、`NanJing`。
- 200–300 dpi；150 dpi 能读，但小字号会掉。
- 解析类页面保留原始换行，不要做段落重排——答案字母靠行位置判断。
- 优先 OCR「答案与详解」部分；试卷优先 Part II 听力选项页和 Part III 阅读页。

## 已单独整理出来的

`2022.06/` 里另有 4 个 PDF 和 10 张已渲染的解析页面图（150 dpi），可直接喂 OCR。
"""
)
(OCR / "说明.md").write_text("\n".join(lines), encoding="utf-8")
print("ok", len(rows), "text", len(text_files), "partial", len(partial), "image", len(image))
