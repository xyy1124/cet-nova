"""按栏读取 PDF 文本：先左栏后右栏，避免两栏排版串行。"""

from __future__ import annotations

import sys
from pathlib import Path

import fitz

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_paper as pp  # noqa: E402


def column_text(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        width = page.rect.width
        blocks = page.get_text("blocks")
        left = [b for b in blocks if b[0] < width * 0.5]
        right = [b for b in blocks if b[0] >= width * 0.5]
        left.sort(key=lambda b: (round(b[1], 1), b[0]))
        right.sort(key=lambda b: (round(b[1], 1), b[0]))
        text = "\n".join(b[4] for b in left + right)
        pages.append(text)
    return pp.normalize("\n".join(pages))


def main() -> int:
    pdf, out = sys.argv[1], sys.argv[2]
    text = column_text(pdf)

    writing = pp.parse_writing(pp.cut(text, "Part I", "Part II"))
    listening = pp.parse_listening(pp.cut(text, "Part II", "Part III"))
    reading_part = pp.cut(text, "Part III", "Part IV")
    data = {
        "source": {"file": pdf, "mode": "column"},
        "writing": writing,
        "listening": listening,
        "reading": {
            "cloze": pp.parse_cloze(reading_part),
            "matching": pp.parse_matching(reading_part),
            "careful": pp.parse_careful(reading_part),
        },
        "translation": pp.parse_translation(text),
    }
    import json

    Path(out).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "listening": sum(len(s["questions"]) for s in listening),
                "cloze": len(data["reading"]["cloze"]["questions"]),
                "matching": len(data["reading"]["matching"]["statements"]),
                "careful": sum(len(p["questions"]) for p in data["reading"]["careful"]),
                "bank": len(data["reading"]["cloze"]["wordBank"]),
                "paragraphs": len(data["reading"]["matching"]["paragraphs"]),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
