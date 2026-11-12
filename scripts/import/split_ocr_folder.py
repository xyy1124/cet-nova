"""把下载的 PDF 按是否需要 OCR 平铺复制到两个文件夹。

安全策略：只复制、不删除源文件；复制后逐个校验体积；最后打印统计。
- 需要OCR/  ：image + partial
- 已有文本/ ：text
源文件保留在 需要OCR/remote/ 作为备份。
"""

from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATUS = json.loads((ROOT / "work" / "scan_status.json").read_text(encoding="utf-8"))
SRC = ROOT / "需要OCR" / "remote"
OCR_DIR = ROOT / "需要OCR"
TEXT_DIR = ROOT / "已有文本"
OCR_DIR.mkdir(exist_ok=True)
TEXT_DIR.mkdir(exist_ok=True)

rows = []
missing = []
for r in STATUS:
    rel = r["file"].replace("\\", "/")
    src = SRC / rel
    sess = rel.split("/")[0]
    kind = "解析" if "/解析-" in "/" + rel else "试卷"
    name = rel.split("/", 1)[1]
    for prefix in ("解析-", "试卷-"):
        if name.startswith(prefix):
            name = name[len(prefix):]
    target_dir = TEXT_DIR if r["verdict"] == "text" else OCR_DIR
    out = target_dir / f"{sess}-{kind}-{name}"

    if not src.exists():
        missing.append(rel)
        continue
    if not (out.exists() and out.stat().st_size == src.stat().st_size):
        shutil.copy2(src, out)
    rows.append(
        {
            "考次": sess,
            "类型": kind,
            "文件名": name,
            "页数": r["pages"],
            "文本层": r["verdict"],
            "字数": r["chars"],
            "中文字数": r["cjk"],
            "位置": str(out.relative_to(ROOT)),
        }
    )

rows.sort(key=lambda x: (x["位置"], x["考次"], x["类型"]))
with open(OCR_DIR / "清单.csv", "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(
        fh,
        fieldnames=["考次", "类型", "文件名", "页数", "文本层", "字数", "中文字数", "位置"],
    )
    w.writeheader()
    w.writerows(rows)

need = [r for r in rows if r["位置"].startswith("需要OCR")]
have = [r for r in rows if r["位置"].startswith("已有文本")]
print("需要OCR", len(need), "已有文本", len(have), "missing", len(missing))
if missing:
    print("missing sample", missing[:3])
