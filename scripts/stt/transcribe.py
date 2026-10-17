"""Hebrew word timestamps for recordings, for the local speech recognition provider
(STT_PROVIDER=whisper, src/lib/ai/providers/stt.ts).

    python -I scripts/stt/transcribe.py <model> <in.json> <out.json>

<in.json> is a list of audio file paths; <out.json> gets one list of
{word, start, end} (seconds) per file, in the same order, or null for a file
that could not be decoded. The model loads once for the whole batch.

Needs faster-whisper (pip install faster-whisper; Python 3.12 works) and ffmpeg
on the PATH. The model is a CTranslate2 Whisper model, by default
ivrit-ai/whisper-large-v3-turbo-ct2 (Hebrew; downloaded from Hugging Face on
first use, about 1.6 GB).
"""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

model_name, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
with open(src, encoding="utf-8") as f:
    files = json.load(f)

model = WhisperModel(model_name, device="auto", compute_type="int8")
results = []
for i, path in enumerate(files):
    # ffmpeg decodes: faster-whisper's own decoder breaks on some PyAV versions.
    decoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        capture_output=True,
    )
    if decoded.returncode != 0 or not decoded.stdout:
        print(f"[{i + 1}/{len(files)}] cannot decode {path}", file=sys.stderr)
        results.append(None)
        continue
    audio = np.frombuffer(decoded.stdout, dtype=np.float32)
    segments, _ = model.transcribe(
        audio, language="he", word_timestamps=True, beam_size=5, condition_on_previous_text=False
    )
    words = [
        {"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
        for segment in segments
        for w in segment.words
        if w.word.strip()
    ]
    print(f"[{i + 1}/{len(files)}] {len(words)} words  {path}", file=sys.stderr)
    results.append(words)

with open(out, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False)
