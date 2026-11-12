"""从"答案速查"型 PDF 里抽答案字母。

支持最常见的版式：题号单独一行、字母单独一行（1 / B / 2 / C ...）。
抽不到的题号会列出来，交给人工补，不猜。

用法：
    python -I parse_answers.py <answer.pdf> <out.json> [--variant v1]
"""

from __future__ import annotations

import json
import re
import sys

import fitz

LETTER = re.compile(r"(?m)^\s*(\d{1,2})\s*\n\s*([A-P])\s*$")
INLINE = re.compile(r"(?m)^\s*(\d{1,2})[.\s、]+([A-P])\s*$")
RANGE = re.compile(r"(\d{1,2})\s*[-–]\s*(\d{1,2})\s*[:：]?\s*([A-P]{2,12})")
ANSWER_HINT = re.compile(r"(?m)^\s*(\d{1,2})[.、]\s*(?:\[)?([A-P])(?:\])?\s*$")


def extract_letters(text: str) -> dict[int, str]:
    letters: dict[int, str] = {}
    for m in LETTER.finditer(text):
        no, letter = int(m.group(1)), m.group(2)
        if 1 <= no <= 55:
            letters.setdefault(no, letter)
    if len(letters) < 45:
        for m in INLINE.finditer(text):
            no, letter = int(m.group(1)), m.group(2)
            if 1 <= no <= 55:
                letters.setdefault(no, letter)
    if len(letters) < 45:
        for m in RANGE.finditer(text):
            lo, hi, seq = int(m.group(1)), int(m.group(2)), m.group(3)
            if hi - lo + 1 == len(seq):
                for offset, letter in enumerate(seq):
                    letters.setdefault(lo + offset, letter)
    if len(letters) < 45:
        for m in ANSWER_HINT.finditer(text):
            no, letter = int(m.group(1)), m.group(2)
            if 1 <= no <= 55:
                letters.setdefault(no, letter)
    return letters


def extract_translation(text: str) -> str:
    for marker in ("参考译文", "参考翻译", "译文参考"):
        at = text.find(marker)
        if at < 0:
            continue
        chunk = text[at + len(marker) :]
        chunk = re.sub(r"^[：:\s]+", "", chunk)
        # 只保留英文段落
        lines = [ln.strip() for ln in chunk.splitlines()]
        english = [ln for ln in lines if re.search(r"[A-Za-z]{3}", ln) and not re.search(r"[\u4e00-\u9fff]", ln)]
        text_out = " ".join(english).strip()
        if len(text_out) > 80:
            return re.sub(r"\s+", " ", text_out)[:2000]
    return ""


def main() -> int:
    pdf_path, out_path = sys.argv[1], sys.argv[2]
    doc = fitz.open(pdf_path)
    text = "\n".join(page.get_text() for page in doc)
    letters = extract_letters(text)
    translation = extract_translation(text)

    missing = [n for n in range(1, 56) if n not in letters]
    data = {
        "letters": {str(k): v for k, v in sorted(letters.items())},
        "missing": missing,
        "referenceTranslation": translation,
        "pages": len(doc),
        "chars": len(text),
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print(json.dumps({"found": len(letters), "missing": missing[:10], "translation": len(translation)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
