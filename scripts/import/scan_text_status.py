"""检查下载下来的扫描件到底有没有可用文本层。

用法：python -I scripts/import/scan_text_status.py
输出每个 PDF 的页数、字符数、中文字符数、判定（text/partial/image）。
"""

from __future__ import annotations

import json
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "需要OCR" / "remote"


def verdict(chars: int, pages: int, cjk: int) -> str:
    if pages == 0:
        return "broken"
    per_page = chars / pages
    if per_page > 800 and cjk > 300:
        return "text"
    if per_page > 200:
        return "partial"
    return "image"


def main() -> int:
    rows = []
    for pdf in sorted(SRC.rglob("*.pdf")):
        try:
            doc = fitz.open(pdf)
            text = "".join(p.get_text() for p in doc)
            cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
            rows.append(
                {
                    "file": str(pdf.relative_to(SRC)),
                    "pages": len(doc),
                    "chars": len(text),
                    "cjk": cjk,
                    "verdict": verdict(len(text), len(doc), cjk),
                }
            )
            print(f"{rows[-1]['verdict']:8} {len(doc):3}p {len(text):7}c {cjk:6}中  {rows[-1]['file']}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"error    {pdf.name}: {exc}", flush=True)

    (ROOT / "work" / "scan_status.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    counts = {}
    for r in rows:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    print("\nsummary", counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
