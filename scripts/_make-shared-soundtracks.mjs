// One-off: makes the shared mood tracks (public/soundtracks/<mood>.mp3) with Lyria and loops them with ffmpeg.
//   node scripts/_make-shared-soundtracks.mjs [mood]   (key from .env.local; Lyria sometimes fails once, rerun that mood)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
process.loadEnvFile(".env.local");
const key = process.env.TEXT_API_KEY || process.env.IMAGE_API_KEY;
const COMMON = "Instrumental only, no vocals, no drums, no sudden changes, steady low intensity from start to end so it loops quietly under spoken narration of a children's story.";
const MOODS = {
  calm: "A very soft, slow bedtime lullaby, about 62 BPM, major key: music box, gentle harp arpeggios, warm airy pads, a little soft piano.",
  playful: "Gentle whimsical playful background, about 90 BPM, major key: pizzicato strings, soft glockenspiel, light ukulele, a little woodwind, cheerful but very soft.",
  adventure: "A gentle sense of wonder and a light journey, about 80 BPM, major key: soft acoustic guitar, warm strings, celesta, flute, hopeful and curious, never loud.",
  warm: "Warm, tender, thoughtful, about 72 BPM, major key: soft acoustic guitar, warm cello, gentle piano, subtle clarinet, cozy family feeling.",
};
const dir = "scripts/sources/ai-specs/shared-soundtracks";
await Promise.all(Object.entries(MOODS).filter(([m]) => !process.argv[2] || m === process.argv[2]).map(async ([mood, text]) => {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro-preview:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${COMMON} ${text}` }] }] }),
  });
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) { console.log(mood, "FAILED", JSON.stringify(json).slice(0, 300)); return; }
  fs.writeFileSync(`${dir}/${mood}-raw.mp3`, Buffer.from(part.inlineData.data, "base64"));
  const sec = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${dir}/${mood}-raw.mp3`]).toString());
  const len = Math.min(sec - 4, 170);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${dir}/${mood}-raw.mp3`, "-af", `atrim=0:${len},asetpts=N/SR/TB,dynaudnorm=f=2000:g=41:m=6,loudnorm=I=-20:LRA=5:TP=-2`, "-ar", "44100", `${dir}/${mood}-even.wav`]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "5", "-i", `${dir}/${mood}-even.wav`, "-t", "5", "-i", `${dir}/${mood}-even.wav`, "-filter_complex", "[0][1]acrossfade=d=5:c1=qsin:c2=qsin", "-c:a", "libmp3lame", "-b:a", "96k", `public/soundtracks/${mood}.mp3`]);
  fs.unlinkSync(`${dir}/${mood}-even.wav`);
  console.log(mood, "ok", Math.round(sec), "s");
}));
