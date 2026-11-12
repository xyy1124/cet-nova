"""检测 raw/papers 下试卷 PDF 的文本层，把需要 OCR 的复制到 需要OCR/试卷/。"""

from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "raw" / "papers"
DST = ROOT / "需要OCR" / "试卷"


def verdict(chars: int, pages: int, cjk: int) -> str:
    if pages == 0:
        return "broken"
    per_page = chars / pages
    if per_page > 800 and cjk > 200:
        return "text"
    if per_page > 200:
        return "partial"
    return "image"


def main() -> int:
    DST.mkdir(parents=True, exist_ok=True)
    rows = []
    for pdf in sorted(SRC.rglob("*.pdf")):
        try:
            doc = fitz.open(pdf)
            text = "".join(p.get_text() for p in doc)
            cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
            v = verdict(len(text), len(doc), cjk)
            sess = pdf.relative_to(SRC).parts[0]
            out = DST / f"{sess}-{pdf.name}"
            if v != "text":
                if not (out.exists() and out.stat().st_size == pdf.stat().st_size):
                    shutil.copy2(pdf, out)
            rows.append(
                {
                    "考次": sess,
                    "文件": pdf.name,
                    "页数": len(doc),
                    "字数": len(text),
                    "中文字数": cjk,
                    "文本层": v,
                    "位置": str(out.relative_to(ROOT)) if v != "text" else "",
                }
            )
            print(f"{v:8} {len(doc):3}p {len(text):7}c  {sess}/{pdf.name}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"error    {pdf}: {exc}", flush=True)

    with open(ROOT / "work" / "papers_status.json", "w", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False, indent=2)
    with open(ROOT / "需要OCR" / "试卷清单.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["考次", "文件", "页数", "字数", "中文字数", "文本层", "位置"])
        w.writeheader()
        w.writerows(rows)
    counts = {}
    for r in rows:
        counts[r["文本层"]] = counts.get(r["文本层"], 0) + 1
    print("summary", counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
