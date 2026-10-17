"""Word timestamps for a LibriVox recording, for scripts/import-librivox.ts.

    python -I scripts/librivox/transcribe.py <audio.mp3> <out.words.json>

Needs faster-whisper (pip install faster-whisper, Python 3.12 works) and ffmpeg
on the PATH. Writes [{word, start, end}] in seconds. The words only time the
book's own text, so small recognition mistakes do not matter: the importer
aligns them to the text with a fuzzy match.
"""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

src, out = sys.argv[1], sys.argv[2]
# ffmpeg decodes: faster-whisper's own decoder breaks on some PyAV versions.
raw = subprocess.run(
    ["ffmpeg", "-v", "error", "-i", src, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
    capture_output=True,
    check=True,
).stdout
audio = np.frombuffer(raw, dtype=np.float32)

model = WhisperModel("small.en", device="cpu", compute_type="int8")
segments, _ = model.transcribe(audio, word_timestamps=True, language="en")
words = [
    {"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
    for segment in segments
    for w in segment.words
]
with open(out, "w", encoding="utf-8") as f:
    json.dump(words, f, ensure_ascii=False, indent=0)
print(f"{len(words)} words -> {out}")
