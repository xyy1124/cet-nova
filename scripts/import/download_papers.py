"""下载所有考次的真题 PDF（走代理），供文本层检测与 OCR。"""

from __future__ import annotations

import json
import subprocess
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TREE = ROOT / "work" / "tree.json"
DST = ROOT / "raw" / "papers"
PROXY = "http://127.0.0.1:7890"
BASE = "https://raw.githubusercontent.com/0609x/CET46-Resources/main/"


def main() -> int:
    tree = json.loads(TREE.read_text(encoding="utf-8"))
    rows = []
    for x in tree["tree"]:
        p = x["path"]
        if (
            x["type"] == "blob"
            and p.startswith("六级真题/")
            and "/真题PDF/" in p
            and p.lower().endswith(".pdf")
        ):
            rows.append((p, x.get("size", 0)))
    print(f"[papers] {len(rows)} files, {sum(s for _, s in rows)/1048576:.1f} MB", flush=True)
    total = 0
    for i, (p, size) in enumerate(rows, 1):
        sess = p.split("/")[1]
        out = DST / sess / p.split("/")[-1]
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists() and out.stat().st_size == size:
            total += size
            print(f"[{i}/{len(rows)}] skip {out.relative_to(DST)}", flush=True)
            continue
        cmd = [
            "curl", "-sL", "-m", "600", "--retry", "3", "-x", PROXY,
            "-C", "-", "-o", str(out), BASE + urllib.parse.quote(p),
        ]
        res = subprocess.run(cmd)
        if res.returncode != 0:
            print(f"[{i}/{len(rows)}] FAIL {p}", flush=True)
            continue
        total += size
        print(f"[{i}/{len(rows)}] ok {out.relative_to(DST)}  {total/1048576:.1f} MB", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
