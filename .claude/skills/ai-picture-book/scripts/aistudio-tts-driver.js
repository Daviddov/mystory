// Gemini TTS narration driver for Google AI Studio's speech playground (free; the API key's credits are not used).
// Paste into https://aistudio.google.com/generate-speech (signed in) with javascript_tool, after clicking "Create new dialog"
// once (model Gemini 3.8 Flash TTS, a speaker, e.g. Fola). Then:
//   1. python -I receiver.py <folder> <port>     (accepts aistudio.google.com; <folder> holds narration-<slug>.json)
//      The json is written by: npx tsx .claude/skills/ai-picture-book/scripts/attach-narration.ts <slug> --prepare <folder>
//   2. window.RX_PORT = <port> BEFORE pasting this file; real-click the yellow OPEN RX button it adds (opens window.rx).
//   3. await setStyle("Read warmly and slowly, like a children's bedtime story")   // free text; the presets are Friendly, Narration, ...
//   4. driver.q = [["<slug>", 1], ["<slug>", 2], ...]   // [slug, 1-based page number]; the timer below runs it
//      read driver.log / driver.last / driver.stopped to follow it.
// Files saved as <slug>-p<NN>.wav (24 kHz mono WAV). Then attach with attach-narration.ts <slug> <folder> and time the words
// with: STT_PROVIDER=whisper npx tsx scripts/align-recordings.ts --book <slug>
window.RX = "http://127.0.0.1:" + (window.RX_PORT || 8841); window.saved = {}; window.GOT = {};
if (!window.__l) { window.__l = 1; addEventListener("message", (e) => { if (e.origin !== RX) return; if (e.data.got) GOT[e.data.got] = e.data.text; if (e.data.saved) saved[e.data.saved] = e.data.bytes; }); }
window.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.getFile = async (name) => { delete GOT[name]; rx.postMessage({ get: name }, RX); for (let k = 0; k < 60 && !GOT[name]; k++) await sleep(200); return GOT[name]; };
window.setValue = (el, text) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, text); el.dispatchEvent(new Event("input", { bubbles: true })); };
// a placeholder clip (< ~1 s) appears while the speech is generated; only a real clip (data: URL > 20 kB) counts
window.audioSrc = () => { const s = document.querySelector("audio")?.src || ""; return s.length > 20000 ? s : ""; };
window.btn = (re) => [...document.querySelectorAll("button")].find((b) => re.test(b.innerText.trim()));
window.setStyle = async (text) => {
  let ta = document.querySelector('textarea[aria-label="Describe the voice style"]');
  if (!ta) { btn(/^Style/)?.click(); await sleep(700); ta = document.querySelector('textarea[aria-label="Describe the voice style"]'); }
  if (!ta) return "no style box";
  setValue(ta, text); await sleep(400);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })); await sleep(500);
  return "style set";
};
window.sendText = async (text) => {
  const ta = document.querySelector('textarea[aria-label="Speech block text"]'); if (!ta) return "no text box";
  setValue(ta, text); await sleep(600);
  const run = btn(/^Run/); if (!run || run.disabled) return "no run button"; run.click(); return "sent";
};
window.saveAudio = async (fname) => {
  const src = audioSrc(); delete saved[fname];
  rx.postMessage({ name: fname, blob: src }, RX);
  for (let k = 0; k < 60 && !saved[fname]; k++) await sleep(300);
  return [fname, document.querySelector("audio")?.duration, saved[fname] || null];
};
window.ERRRE = /exceeded|RESOURCE_EXHAUSTED|rate limit|something went wrong|failed to generate|An internal error|daily limit|quota/i;
window.driver = { q: [], cur: null, stopped: null, log: [], errs: 0, texts: {} };
window.tick = async () => {
  const d = driver; if (d.stopped) return ["STOPPED", d.stopped];
  if (!d.cur) {
    const n = d.q.shift(); if (!n) return ["QUEUE EMPTY"]; d.pending = n;
    if (!d.texts[n[0]]) { const f = await getFile("narration-" + n[0] + ".json"); if (!f) { d.stopped = "no narration-" + n[0] + ".json from the receiver"; return ["STOP", d.stopped]; } d.texts[n[0]] = JSON.parse(f); }
    const p = d.texts[n[0]].find((x) => x.page === n[1]); if (!p) { d.stopped = "no page " + n[1] + " in the json"; return ["STOP", d.stopped]; }
    const old = audioSrc(); const r = await sendText(p.text);
    if (r !== "sent") { d.stopped = "send failed: " + r; d.q.unshift(n); return ["STOP", r]; }
    d.cur = { slug: n[0], page: n[1], old, t: Date.now() }; d.pending = null; return ["sent", n];
  }
  const c = d.cur; const now = audioSrc();
  const bad = document.querySelector("main")?.innerText.match(ERRRE);
  if (now === c.old || !now) {
    if (bad) { d.stopped = "error text: " + bad[0]; d.q.unshift([c.slug, c.page]); d.cur = null; return ["STOP", bad[0]]; }
    if (Date.now() - c.t > 120000) { d.stopped = "timeout waiting for audio"; d.q.unshift([c.slug, c.page]); d.cur = null; return ["STOP", "timeout"]; }
    return ["waiting", c.slug, c.page];
  }
  await sleep(2500); if (audioSrc() !== now) return ["still changing"];
  const name = c.slug + "-p" + String(c.page).padStart(2, "0") + ".wav";
  const r = await saveAudio(name);
  if (!r[2]) { d.errs++; if (d.errs > 4) d.stopped = "receiver not answering (click OPEN RX)"; return ["not saved", name]; }
  d.log.push(r); d.cur = null; return ["saved", ...r];
};
window.__busy = false; clearInterval(window.autoTimer);
window.autoTimer = setInterval(async () => { if (window.__busy || driver.stopped) return; window.__busy = true; try { driver.last = await tick(); } catch (e) { if (driver.pending && !driver.cur) { driver.q.unshift(driver.pending); driver.pending = null; } driver.last = ["ERR", String(e)]; driver.errs++; if (driver.errs > 6) driver.stopped = "too many errors: " + e; } window.__busy = false; }, 4000);
// real-click the injected yellow button once so the receiver tab opens (window.rx):
(() => { let b = document.getElementById("rxbtn"); if (!b) { b = document.createElement("button"); b.id = "rxbtn"; b.textContent = "OPEN RX"; b.style.cssText = "position:fixed;top:5px;left:600px;z-index:99999;padding:10px;background:#ff0;font-size:16px;color:#000"; b.onclick = () => { window.rx = window.open(RX + "/rx", "rx" + (window.RX_PORT || 8841)); }; document.body.appendChild(b); } const r = b.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })();
