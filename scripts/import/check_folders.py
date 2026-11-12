from pathlib import Path

root = Path(__file__).resolve().parents[2]
print("root", root)
for name in ("需要OCR", "已有文本", "raw", "work"):
    d = root / name
    if not d.exists():
        print(name, "MISSING")
        continue
    files = [f for f in d.rglob("*") if f.is_file()]
    size = sum(f.stat().st_size for f in files) / 1048576 if files else 0
    print(f"{name}: {len(files)} files, {size:.1f} MB")
    for sub in sorted(d.iterdir()):
        if sub.is_dir():
            sf = [f for f in sub.rglob("*") if f.is_file()]
            print(f"   {sub.name}: {len(sf)} files, {sum(f.stat().st_size for f in sf)/1048576:.1f} MB")
print("all pdfs:", len(list(root.rglob("*.pdf"))))
