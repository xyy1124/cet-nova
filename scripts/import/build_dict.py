"""把 CET6 词表转成精简单词库 JSON。

输入：mahavivo/english-wordlists 的 CET6_edited.txt（UTF-8）
输出：apps/web/src/lib/dict-data.json
"""

import json
import pathlib
import re
import sys

LINE = re.compile(r"^([A-Za-z][A-Za-z' -]*?)\s+\[([^\]]*)\]\s+(.*)$")
POS = re.compile(r"^((?:[a-z]+\.\s*)+)(.*)$")


def main() -> int:
    src = pathlib.Path(sys.argv[1])
    dst = pathlib.Path(sys.argv[2])
    out: dict[str, dict[str, str]] = {}
    skipped = 0

    for raw in src.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        m = LINE.match(line)
        if not m:
            skipped += 1
            continue
        word, phonetic, rest = m.group(1).strip().lower(), m.group(2).strip(), m.group(3)
        pos = ""
        pm = POS.match(rest)
        if pm:
            pos = re.sub(r"\s+", " ", pm.group(1)).strip()
            rest = pm.group(2)
        zh = re.sub(r"\s+", " ", rest).strip()
        if len(zh) > 80:
            zh = zh[:78] + "…"
        if word and zh:
            out[word] = {"p": phonetic, "pos": pos, "zh": zh}

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({"entries": len(out), "skipped": skipped, "bytes": dst.stat().st_size}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
