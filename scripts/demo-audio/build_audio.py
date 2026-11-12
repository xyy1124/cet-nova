"""把逐句 TTS 的 wav 拼成一条音频，并输出每句的精确起止时间。

用法：
    python build_audio.py <parts_dir> <out_wav>
"""

import json
import pathlib
import sys
import wave


def main() -> int:
    parts = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2])
    files = sorted(parts.glob("s*.wav"))
    if not files:
        print("no wav files", file=sys.stderr)
        return 1

    params = None
    chunks = []
    timings = []
    cursor = 0.0

    for f in files:
        with wave.open(str(f), "rb") as w:
            p = (w.getnchannels(), w.getsampwidth(), w.getframerate())
            if params is None:
                params = p
            if p != params:
                print(f"format mismatch in {f}: {p} vs {params}", file=sys.stderr)
                return 2
            n = w.getnframes()
            data = w.readframes(n)
            duration = n / float(p[2])
            timings.append(
                {
                    "startMs": int(round(cursor * 1000)),
                    "endMs": int(round((cursor + duration) * 1000)),
                }
            )
            chunks.append(data)
            cursor += duration

    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(params[0])
        w.setsampwidth(params[1])
        w.setframerate(params[2])
        w.writeframes(b"".join(chunks))

    print(
        json.dumps(
            {
                "durationMs": int(round(cursor * 1000)),
                "sampleRate": params[2],
                "channels": params[0],
                "sentences": timings,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
