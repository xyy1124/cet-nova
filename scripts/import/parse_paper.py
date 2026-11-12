"""把 CET 六级真题 PDF 解析成结构化 JSON。

用法：
    python -I parse_paper.py <paper.pdf> <out.json>

只负责"抽取与切分"，不负责判对错。输出里的每个字段都应该在
review 阶段被人工或双源答案核对过才能进正式题库。
"""

from __future__ import annotations

import json
import re
import sys

import fitz

# PDF 里混入了西里尔字母（В/А/С…），先归一化
CYRILLIC = str.maketrans(
    {
        "А": "A",
        "В": "B",
        "С": "C",
        "Е": "E",
        "Н": "H",
        "К": "K",
        "М": "M",
        "О": "O",
        "Р": "P",
        "Т": "T",
        "Х": "X",
        "У": "Y",
        "І": "I",
    }
)

HEADER = re.compile(
    r"\d{4}\s*年\s*\d{1,2}\s*月英语六级真题第\s*\d+\s*套\s*第\s*\d+\s*页[，,]\s*共\s*\d+\s*页"
)

# 选项末尾常粘上下一节的引导语或页眉，统一截断
TAIL_NOISE = re.compile(
    r"(?:Questions\s+\d+\s+to\s+\d+\s+are based|Section\s+[A-C]\b|"
    r"\d{4}\s*年\s*\d{1,2}\s*月英语六级真题第)"
)


def clean_option(text: str) -> str:
    return squeeze(TAIL_NOISE.split(text, maxsplit=1)[0])


def normalize(text: str) -> str:
    text = text.translate(CYRILLIC)
    # 罗马数字（Ⅰ Ⅱ Ⅲ Ⅳ）归一化成 ASCII，2015/2016 卷用这种写法
    for roman, ascii_ in (("Ⅰ", "I"), ("Ⅱ", "II"), ("Ⅲ", "III"), ("Ⅳ", "IV"), ("Ⅴ", "V")):
        text = text.replace(roman, ascii_)
    text = text.replace("\u00a0", " ").replace("\u2019", "'").replace("\u2018", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = HEADER.sub("", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def squeeze(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def cut(text: str, start: str, end: str | None) -> str:
    i = text.find(start)
    if i < 0:
        return ""
    i += len(start)
    if end is None:
        return text[i:]
    j = text.find(end, i)
    return text[i:] if j < 0 else text[i:j]


def parse_options(block: str) -> dict[str, str]:
    """选项可能是 2×2 排版（A/C 同一行、B/D 下一行），按字母回收。"""
    marks = list(re.finditer(r"([A-D])\)\s*", block))
    options: dict[str, str] = {}
    for idx, m in enumerate(marks):
        letter = m.group(1)
        start = m.end()
        end = marks[idx + 1].start() if idx + 1 < len(marks) else len(block)
        text = squeeze(block[start:end])
        text = re.sub(r"\s*[A-D]\)\s*$", "", text)
        text = clean_option(text)
        if letter not in options and text:
            options[letter] = text
    return options


def split_questions(text: str, lo: int, hi: int, require_options: bool = True):
    """按行首题号切分；只保留落在范围内的题。"""
    pattern = re.compile(r"(?m)^\s*(\d{1,2})\.\s*")
    marks = list(pattern.finditer(text))
    out = []
    for idx, m in enumerate(marks):
        no = int(m.group(1))
        if not (lo <= no <= hi):
            continue
        end = marks[idx + 1].start() if idx + 1 < len(marks) else len(text)
        chunk = text[m.end() : end]
        if require_options and not re.search(r"[A-D]\)", chunk):
            continue
        out.append((no, chunk))
    return out


def parse_listening(part: str):
    sections = []
    for name, lo, hi in (("A", 1, 8), ("B", 9, 15), ("C", 16, 25)):
        start = part.find(f"Section {name}")
        if start < 0:
            continue
        nxt = part.find(f"Section {chr(ord(name) + 1)}", start + 1)
        block = part[start:] if nxt < 0 else part[start:nxt]
        questions = []
        for no, chunk in split_questions(block, lo, hi):
            questions.append(
                {
                    "no": no,
                    "options": parse_options(chunk),
                    # CET 听力题干不印在卷面上，只放在录音里
                    "stem": "",
                    "stemSource": "audio",
                }
            )
        sections.append({"section": name, "questions": questions})
    return sections


def parse_cloze(part: str):
    block = cut(part, "Section A", "Section B")
    for marker in (
        r"You may not use any of the words\s+in the bank more than once\.",
        r"Questions 26 to 35 are based on the following passage\.",
    ):
        found = re.search(marker, block)
        if found:
            block = block[found.end() :]
            break
    bank_at = re.search(r"(?m)^\s*A\)\s+[A-Za-z]", block)
    if not bank_at:
        return {"passage": "", "wordBank": {}, "questions": []}
    passage = block[: bank_at.start()]
    bank_text = block[bank_at.start() :]
    # 空位有三种常见写法：___26___ / [26] / （26）
    passage = re.sub(r"_{2,}\s*(\d{1,2})\s*_{2,}", r"{{\1}}", passage)
    passage = re.sub(r"\[\s*(\d{1,2})\s*\]", r"{{\1}}", passage)
    passage = squeeze(passage)
    bank = {}
    for m in re.finditer(r"([A-P])\)\s*([A-Za-z][A-Za-z'-]*)", bank_text):
        bank.setdefault(m.group(1), m.group(2).lower())
    questions = [
        {"no": no, "blankIndex": i + 1}
        for i, no in enumerate(range(26, 36))
        if f"{{{{{no}}}}}" in passage
    ]
    return {"passage": passage, "wordBank": bank, "questions": questions}


def parse_matching(part: str):
    block = cut(part, "Section B", "Section C")
    # 跳过 Directions，取标题行
    dir_end = block.find("Answer Sheet 2.")
    if dir_end >= 0:
        block = block[dir_end + len("Answer Sheet 2.") :]
    paragraphs = []
    marks = list(re.finditer(r"(?m)^\s*([A-P])\)\s+", block))
    stmt_start = re.search(r"(?m)^\s*36\.\s", block)
    title = ""
    if marks:
        title = squeeze(block[: marks[0].start()])
    for idx, m in enumerate(marks):
        letter = m.group(1)
        start = m.end()
        if idx + 1 < len(marks):
            end = marks[idx + 1].start()
        elif stmt_start and stmt_start.start() > m.start():
            end = stmt_start.start()
        else:
            end = len(block)
        paragraphs.append({"id": letter, "text": squeeze(block[start:end])})
    # 段落之后是 36–45 陈述句
    tail_start = stmt_start.start() if stmt_start else (marks[-1].end() if marks else 0)
    tail = block[tail_start:]
    # 有些卷子给陈述句加了 "1. 2. 3." 的列表序号，先剥掉
    tail = re.sub(r"(?m)^\s*\d{1,2}\.\s+(?=\d{1,2}\.\s)", "", tail)
    statements = []
    for no, chunk in split_questions(tail, 36, 45, require_options=False):
        statements.append({"no": no, "text": squeeze(chunk)})
    return {"title": title, "paragraphs": paragraphs, "statements": statements}


def parse_careful(part: str):
    block = cut(part, "Section C", "Part IV")
    dir_end = block.find("Answer Sheet 2.")
    if dir_end >= 0:
        block = block[dir_end + len("Answer Sheet 2.") :]
    passages = []
    for label, lo, hi in (("Passage One", 46, 50), ("Passage Two", 51, 55)):
        start = block.find(label)
        if start < 0:
            continue
        nxt = block.find("Passage Two" if label == "Passage One" else "Part IV", start + 1)
        chunk = block[start:] if nxt < 0 else block[start:nxt]
        qmark = re.search(r"(?m)^\s*%d\.\s" % lo, chunk)
        if not qmark:
            continue
        body = chunk[: qmark.start()]
        body = body.replace(label, "", 1)
        body = re.sub(r"Questions \d+ to \d+ are based on the following passage\.", "", body)
        questions = []
        for no, qchunk in split_questions(chunk, lo, hi):
            opts = parse_options(qchunk)
            stem = squeeze(re.split(r"[A-D]\)\s*", qchunk, maxsplit=1)[0])
            questions.append({"no": no, "stem": stem, "options": opts})
        passages.append({"label": label, "text": squeeze(body), "questions": questions})
    return passages


def parse_writing(part: str):
    body = cut(part, "Directions:", "Part II")
    quoted = re.search(r'"([^"]{40,})"', body)
    return {
        "directions": squeeze(body),
        "sentence": squeeze(quoted.group(1)) if quoted else "",
    }


def parse_translation(part: str):
    body = cut(part, "Part IV", None)
    body = body.replace("Translation", "", 1)
    body = re.sub(r"\(\d+ minutes\)", "", body)
    dir_end = body.find("Directions:")
    if dir_end >= 0:
        body = body[dir_end:]
    lines = [ln.strip() for ln in body.splitlines()]
    zh = [ln for ln in lines if re.search(r"[\u4e00-\u9fff]", ln) and not ln.startswith("Directions")]
    return {"text": squeeze(" ".join(zh))}


def main() -> int:
    pdf_path, out_path = sys.argv[1], sys.argv[2]
    doc = fitz.open(pdf_path)
    text = normalize("\n".join(page.get_text() for page in doc))

    writing = parse_writing(cut(text, "Part I", "Part II"))
    listening = parse_listening(cut(text, "Part II", "Part III"))
    reading_part = cut(text, "Part III", "Part IV")
    reading = {
        "cloze": parse_cloze(reading_part),
        "matching": parse_matching(reading_part),
        "careful": parse_careful(reading_part),
    }
    translation = parse_translation(text)

    data = {
        "source": {"file": pdf_path, "pages": len(doc)},
        "writing": writing,
        "listening": listening,
        "reading": reading,
        "translation": translation,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)

    # 自检摘要
    counts = {
        "listening": sum(len(s["questions"]) for s in listening),
        "cloze": len(reading["cloze"]["questions"]),
        "matching": len(reading["matching"]["statements"]),
        "careful": sum(len(p["questions"]) for p in reading["careful"]),
        "clozeBank": len(reading["cloze"]["wordBank"]),
        "paragraphs": len(reading["matching"]["paragraphs"]),
    }
    print(json.dumps(counts, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
