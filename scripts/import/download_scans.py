"""把需要 OCR 的扫描件批量下载到 需要OCR/remote/。

用法：python -I scripts/import/download_scans.py
走本机代理 127.0.0.1:7890；已存在且体积一致的文件会自动跳过。
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TREE = ROOT / "work" / "tree.json"
DST = ROOT / "需要OCR" / "remote"
PROXY = "http://127.0.0.1:7890"
BASE = "https://raw.githubusercontent.com/0609x/CET46-Resources/main/"


def selected() -> list[dict]:
    tree = json.loads(TREE.read_text(encoding="utf-8"))
    rows = []
    for x in tree["tree"]:
        p = x["path"]
        if x["type"] != "blob" or not p.startswith("六级真题/") or not p.endswith(".pdf"):
            continue
        parts = p.split("/")
        if len(parts) < 4:
            continue
        sess, folder, name = parts[1], parts[2], parts[3]
        size = x.get("size", 0)
        need = False
        if folder == "答案解析" and size >= 5 * 1048576:
            need = True
        if folder == "真题PDF" and size >= 8 * 1048576:
            need = True
        if sess == "2022.06":
            need = True
        if not need:
            continue
        rows.append(
            {
                "path": p,
                "sess": sess,
                "kind": "解析" if folder == "答案解析" else "试卷",
                "name": name,
                "size": size,
                "url": BASE + urllib.parse.quote(p),
            }
        )
    return rows


def main() -> int:
    rows = selected()
    DST.mkdir(parents=True, exist_ok=True)
    total = sum(r["size"] for r in rows)
    done_bytes = 0
    print(f"[scans] {len(rows)} files, {total/1048576:.1f} MB", flush=True)

    for i, r in enumerate(rows, 1):
        out = DST / r["sess"] / f"{r['kind']}-{r['name']}"
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists() and out.stat().st_size == r["size"]:
            done_bytes += r["size"]
            print(f"[{i}/{len(rows)}] skip {out.relative_to(DST)}", flush=True)
            continue
        cmd = [
            "curl", "-sL", "-m", "600", "--retry", "3", "--retry-delay", "2",
            "-x", PROXY, "-C", "-", "-o", str(out), r["url"],
        ]
        print(f"[{i}/{len(rows)}] get  {out.relative_to(DST)} ({r['size']/1048576:.1f} MB)", flush=True)
        res = subprocess.run(cmd)
        if res.returncode != 0:
            print(f"  !! curl exit {res.returncode}", flush=True)
            continue
        done_bytes += r["size"]
        print(f"  ok  {done_bytes/1048576:.1f}/{total/1048576:.1f} MB", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
