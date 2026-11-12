"""解析 MinerU 输出的试卷 full.md。

用法：python -I parse_paper_md.py <full.md> <out.json>
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_paper import (  # noqa: E402
    clean_option,
    parse_options,
    parse_writing,
    squeeze,
    split_questions,
)

IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")
HEAD = re.compile(r"(?m)^#{1,6}\s*")
TAG = re.compile(r"<[^>]+>")


def md_to_text(md: str) -> str:
    text = IMG.sub("", md)
    text = text.replace("</td>", "\t").replace("</tr>", "\n")
    text = TAG.sub("", text)
    text = HEAD.sub("", text)
    text = text.replace("\\_", "_").replace("\\*", "*")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def section(text: str, start: str, end: str | None) -> str:
    i = text.find(start)
    if i < 0:
        return ""
    if end is None:
        return text[i + len(start) :]
    j = text.find(end, i + len(start))
    return text[i + len(start) :] if j < 0 else text[i + len(start) : j]


def normalize_blanks(passage: str) -> str:
    passage = re.sub(r"_{1,}\s*(\d{1,2})\s*_{1,}", r"{{\1}}", passage)
    passage = re.sub(r"\[\s*(\d{1,2})\s*\]", r"{{\1}}", passage)
    # 剩下的是 OCR 丢下划线的裸数字，按 26–35 顺序各替换一次
    for n in range(26, 36):
        if f"{{{{{n}}}}}" in passage:
            continue
        passage = re.sub(rf"\b{n}\b", f"{{{{{n}}}}}", passage, count=1)
    return passage


def parse_listening_md(block: str):
    out = []
    for name, lo, hi in (("A", 1, 8), ("B", 9, 15), ("C", 16, 25)):
        start = block.find(f"Section {name}")
        if start < 0:
            continue
        nxt = block.find(f"Section {chr(ord(name) + 1)}", start + 1)
        sub = block[start:] if nxt < 0 else block[start:nxt]
        qs = []
        for no, chunk in split_questions(sub, lo, hi):
            qs.append({"no": no, "options": parse_options(chunk), "stem": "", "stemSource": "audio"})
        out.append({"section": name, "questions": qs})
    return out


def parse_cloze_md(block: str):
    body = section(block, "Section A", "Section B")
    marker = re.search(r"You may not use any of the words\s+in the bank more than once\.", body)
    if marker:
        body = body[marker.end() :]
    bank_at = re.search(r"(?m)^\s*A\)\s+[A-Za-z]", body)
    if not bank_at:
        return {"passage": "", "wordBank": {}, "questions": []}
    passage = normalize_blanks(body[: bank_at.start()].strip())
    bank_text = body[bank_at.start() :]
    bank = {}
    for m in re.finditer(r"([A-P])\)\s*([A-Za-z][A-Za-z'-]*)", bank_text):
        bank.setdefault(m.group(1), m.group(2).lower())
    questions = [{"no": n, "blankIndex": i + 1} for i, n in enumerate(range(26, 36)) if f"{{{{{n}}}}}" in passage]
    return {"passage": squeeze(passage), "wordBank": bank, "questions": questions}


def parse_matching_md(block: str):
    body = section(block, "Section B", "Section C")
    d = body.find("Answer Sheet 2.")
    if d >= 0:
        body = body[d + len("Answer Sheet 2.") :]
    marks = list(re.finditer(r"(?m)^\s*(?:\[([A-P])\]|([A-P])\))\s+", body))
    title = squeeze(body[: marks[0].start()]) if marks else ""
    paragraphs = []
    stmt_start = re.search(r"(?m)^\s*36\.\s", body)
    for idx, m in enumerate(marks):
        if idx + 1 < len(marks):
            end = marks[idx + 1].start()
        elif stmt_start and stmt_start.start() > m.start():
            end = stmt_start.start()
        else:
            end = len(body)
        paragraphs.append({"id": m.group(1), "text": squeeze(body[m.end() : end])})
    tail_start = stmt_start.start() if stmt_start else (marks[-1].end() if marks else 0)
    tail = re.sub(r"(?m)^\s*\d{1,2}\.\s+(?=\d{1,2}\.\s)", "", body[tail_start:])
    statements = [
        {"no": no, "text": squeeze(chunk)}
        for no, chunk in split_questions(tail, 36, 45, require_options=False)
    ]
    return {"title": title, "paragraphs": paragraphs, "statements": statements}


def parse_careful_md(block: str):
    body = section(block, "Section C", "Translation")
    d = body.find("Answer Sheet 2.")
    if d >= 0:
        body = body[d + len("Answer Sheet 2.") :]
    passages = []
    # 这版 OCR 不印 "Passage One/Two"，用题号区间切
    bounds = [
        ("Passage One", 46, 50, r"Questions\s+46\s+to\s+50"),
        ("Passage Two", 51, 55, r"Questions\s+51\s+to\s+55"),
    ]
    for label, lo, hi, marker in bounds:
        m = re.search(marker, body)
        if not m:
            continue
        start = m.end()
        nxt = re.search(r"Questions\s+51\s+to\s+55", body[start:])
        end = start + nxt.start() if nxt else len(body)
        chunk = body[start:end]
        qmark = re.search(r"(?m)^\s*%d\.\s" % lo, chunk)
        if not qmark:
            continue
        head = chunk[: qmark.start()]
        qs = []
        for no, qchunk in split_questions(chunk, lo, hi):
            opts = parse_options(qchunk)
            stem = squeeze(re.split(r"[A-D]\)\s*", qchunk, maxsplit=1)[0])
            qs.append({"no": no, "stem": stem, "options": opts})
        passages.append({"label": label, "text": squeeze(head), "questions": qs})
    return passages


def main() -> int:
    md_path, out_path = sys.argv[1], sys.argv[2]
    text = md_to_text(Path(md_path).read_text(encoding="utf-8", errors="ignore"))

    listening_block = section(text, "Listening Comprehension", "Reading Comprehension")
    reading_block = section(text, "Reading Comprehension", "Translation")
    translation_block = section(text, "Translation", None)
    writing_block = text[: text.find("Listening Comprehension")]

    writing_body = section(writing_block, "Directions:", None)
    quoted = re.search(r'"([^"]{40,})"', writing_body)
    writing = {
        "directions": squeeze(writing_body),
        "sentence": squeeze(quoted.group(1)) if quoted else "",
    }

    data = {
        "source": {"file": md_path},
        "writing": writing,
        "listening": parse_listening_md(listening_block),
        "reading": {
            "cloze": parse_cloze_md(reading_block),
            "matching": parse_matching_md(reading_block),
            "careful": parse_careful_md(reading_block),
        },
        "translation": {"text": squeeze(translation_block.split("Directions:")[-1])},
    }
    Path(out_path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    counts = {
        "listening": sum(len(s["questions"]) for s in data["listening"]),
        "cloze": len(data["reading"]["cloze"]["questions"]),
        "matching": len(data["reading"]["matching"]["statements"]),
        "careful": sum(len(p["questions"]) for p in data["reading"]["careful"]),
        "bank": len(data["reading"]["cloze"]["wordBank"]),
        "paragraphs": len(data["reading"]["matching"]["paragraphs"]),
    }
    print(json.dumps(counts, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
