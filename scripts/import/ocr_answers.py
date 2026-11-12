"""从 OCR 后的解析 full.md 抽 1–55 答案，输出 build_pack.mjs 需要的 JSON。

用法：
  python -I ocr_answers.py <full.md> <paper> <variant> <out.json> \
      --audio-url URL --audio-bytes N [--source-id S] [--audio-note T]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_answers import extract_translation  # noqa: E402

NUM = re.compile(r"(?:<td[^>]*>|\n)\s*(?:#{1,4}\s*)?(\d{1,2})\.")
HINT = re.compile(r"\[(?:答案精析|锁定答案|答案)\]\s*([A-P])")


def extract(text: str) -> dict[int, str]:
    hits: dict[int, str] = {}
    for pat in (
        r"(?m)^#{1,4}\s*(\d{1,2})\.\s*([A-P])\b",
        r"(?m)^#{1,4}\s*(\d{1,2})\.\s*(?:答案|【答案】)[:：]?\s*([A-P])",
        r"(\d{1,2})\.\s*(?:答案|【答案】)[:：]?\s*([A-P])",
    ):
        for m in re.finditer(pat, text):
            n = int(m.group(1))
            if 1 <= n <= 55:
                hits.setdefault(n, m.group(2))
    for m in HINT.finditer(text):
        before = text[max(0, m.start() - 2000) : m.start()]
        nums = list(NUM.finditer(before))
        if nums:
            n = int(nums[-1].group(1))
            if 1 <= n <= 55:
                hits.setdefault(n, m.group(1))
    # 2023/2022 版式：题号+题干，下一段 “B)【精析】/【语法判断】”
    for m in re.finditer(
        r"(?s)(?m)^\s*(\d{1,2})\.\s*[^\n]*\n(?:[^\n]*\n){0,5}?\s*([A-P])[)）]\s*【",
        text,
    ):
        n = int(m.group(1))
        if 1 <= n <= 55:
            hits.setdefault(n, m.group(2))
    # 阅读：段末 “故答案为C)”
    for m in re.finditer(r"故答案为\s*([A-P])", text):
        before = text[max(0, m.start() - 2500) : m.start()]
        nums = list(NUM.finditer(before))
        if nums:
            n = int(nums[-1].group(1))
            if 26 <= n <= 55:
                hits.setdefault(n, m.group(1))
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("md")
    ap.add_argument("paper")
    ap.add_argument("variant")
    ap.add_argument("out")
    ap.add_argument("--audio-url", required=True)
    ap.add_argument("--audio-bytes", type=int, required=True)
    ap.add_argument("--amplitude-note", default="")
    ap.add_argument("--source-id", default="mineru-ocr")
    ap.add_argument("--no-listening", action="store_true")
    args = ap.parse_args()

    text = Path(args.md).read_text(encoding="utf-8", errors="ignore")
    letters = extract(text)
    required = range(26, 56) if args.no_listening else range(1, 56)
    miss = [n for n in required if n not in letters]
    if miss:
        print(json.dumps({"error": "missing", "missing": miss}), flush=True)
        return 2

    data = {
        "paper": args.paper,
        "variant": args.variant,
        "sources": [
            {
                "id": args.source_id,
                "url": "file://" + str(Path(args.md).resolve()),
                "title": f"{args.paper} 解析（MinerU OCR）",
                "covers": "listening,cloze,matching,careful",
                "matchedBy": ["OCR 全文，答案标记 [答案]/[锁定答案]/[答案精析]"],
            }
        ],
        "listening": {} if args.no_listening else {str(n): letters[n] for n in range(1, 26)},
        "cloze": {str(n): letters[n] for n in range(26, 36)},
        "matching": {str(n): letters[n] for n in range(36, 46)},
        "careful": {str(n): letters[n] for n in range(46, 56)},
        "audio": {
            "url": args.audio_url,
            "bytes": args.audio_bytes,
            "note": args.amplitude_note or f"{args.paper} 听力音频",
        },
        "referenceTranslation": extract_translation(text),
    }
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "answers": len(letters), "translation": len(data["referenceTranslation"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
