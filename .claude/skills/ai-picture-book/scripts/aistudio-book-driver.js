// WHOLE-BOOK narration in AI Studio's speech playground: one request per book instead of one per page (far fewer runs
// against the free quota). The audio is cut into pages afterwards by split-book-audio.ts.
// Setup as in aistudio-tts-driver.js (receiver with narration-<slug>.json files, window.RX_PORT, OPEN RX button, Create new dialog,
// setStyle), but paste THIS file. Then:  bookDriver.q = ["<slug>", "<slug>", ...]   (the timer runs it; read bookDriver.log/last/stopped)
// Saves <slug>-book.wav (24 kHz mono) to the receiver folder.
// How the audio is read: the page's <audio> is only a stub for long speech. The Download button builds one WAV Blob, so a Blob
// wrapper keeps the last big one and the page posts it to the receiver. NOTE the click still saves "Generated Audio ....wav"
// in the browser's Downloads folder; move those away afterwards (the receiver copy is the one used).
// AI Studio plays the generated speech aloud as soon as it is ready; keep every media element muted and paused so the
// narration run is silent (the WAV comes from the Download button, not from playback). Also mute the tab by hand if needed.
if (!window.__muteTimer) window.__muteTimer = setInterval(() => document.querySelectorAll("audio, video").forEach((m) => { m.muted = true; m.volume = 0; if (!m.paused) m.pause(); }), 300);
window.RX = "http://127.0.0.1:" + (window.RX_PORT || 8861); window.saved = window.saved || {}; window.GOT = window.GOT || {};
if (!window.__l2) { window.__l2 = 1; addEventListener("message", (e) => { if (e.origin !== RX) return; if (e.data.got) GOT[e.data.got] = e.data.text; if (e.data.saved) saved[e.data.saved] = e.data.bytes; }); }
window.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.getFile = async (name) => { delete GOT[name]; rx.postMessage({ get: name }, RX); for (let k = 0; k < 60 && !GOT[name]; k++) await sleep(200); return GOT[name]; };
window.setValue = (el, text) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, text); el.dispatchEvent(new Event("input", { bubbles: true })); };
window.btn = (re) => [...document.querySelectorAll("button")].find((b) => re.test(b.innerText.trim().replace(/^[a-z_]+\n/, "")));
window.setStyle = async (text) => {
  let ta = document.querySelector('textarea[aria-label="Describe the voice style"]');
  if (!ta) { btn(/^Style/)?.click(); await sleep(700); ta = document.querySelector('textarea[aria-label="Describe the voice style"]'); }
  if (!ta) return "no style box";
  setValue(ta, text); await sleep(400);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })); await sleep(500);
  return "style set";
};
if (!window.__blobHook) { window.__blobHook = 1; const OB = window.Blob; window.Blob = function (parts, opt) { const b = new OB(parts, opt); if (b.size > 100000) window.__bigblob = b; return b; }; window.Blob.prototype = OB.prototype; }
window.isRunning = () => [...document.querySelectorAll("button")].some((b) => /Stop/.test(b.innerText) && !/Run/.test(b.innerText));
window.ERRRE = /Quota limit reached|exceeded|RESOURCE_EXHAUSTED|rate limit|something went wrong|failed to generate|An internal error|daily limit/i;
window.bookDriver = { q: [], cur: null, pending: null, stopped: null, log: [], errs: 0, sizes: [] };
window.bookTick = async () => {
  const d = bookDriver; if (d.stopped) return ["STOPPED", d.stopped];
  const bad = document.body.innerText.match(ERRRE);
  if (!d.cur) {
    const slug = d.q.shift(); if (!slug) return ["QUEUE EMPTY"]; d.pending = slug;
    if (bad) { d.stopped = "error text: " + bad[0]; d.q.unshift(slug); d.pending = null; return ["STOP", bad[0]]; }
    const f = await getFile("narration-" + slug + ".json"); if (!f) { d.stopped = "no narration-" + slug + ".json from the receiver"; return ["STOP", d.stopped]; }
    const text = JSON.parse(f).map((p) => p.text).join("\n\n");
    const ta = document.querySelector('textarea[aria-label="Speech block text"]'); if (!ta) { d.stopped = "no text box"; d.q.unshift(slug); return ["STOP", d.stopped]; }
    setValue(ta, text); await sleep(800); window.__bigblob = null;
    const run = btn(/^Run/); if (!run || run.disabled) { d.stopped = "no run button"; d.q.unshift(slug); return ["STOP", d.stopped]; }
    run.click(); d.cur = { slug, t: Date.now(), chars: text.length }; d.pending = null; return ["sent", slug, text.length];
  }
  const c = d.cur; await sleep(500);
  if (bad) { d.stopped = "error text: " + bad[0]; d.q.unshift(c.slug); d.cur = null; return ["STOP", bad[0]]; }
  if (isRunning()) c.started = true;
  if (!c.started && Date.now() - c.t < 30000) return ["waiting for the run to start", c.slug]; // a short book can finish between two ticks
  if (isRunning() || !btn(/^Run/)) { if (Date.now() - c.t > 420000) { d.stopped = "timeout waiting for audio"; d.q.unshift(c.slug); d.cur = null; return ["STOP", "timeout"]; } return ["generating", c.slug]; }
  await sleep(2500); if (isRunning()) return ["still generating"];
  const dl = document.querySelector('button[aria-label="Download"]'); if (!dl) { d.errs++; if (d.errs > 4) d.stopped = "no Download button"; return ["no download button yet"]; }
  window.__bigblob = null; dl.click();
  for (let k = 0; k < 30 && !window.__bigblob; k++) await sleep(300);
  if (!window.__bigblob) { d.errs++; if (d.errs > 4) d.stopped = "download blob not captured"; return ["blob not captured"]; }
  const sec = (window.__bigblob.size - 44) / 48000, words = c.chars / 5.2;
  if (d.sizes.includes(window.__bigblob.size) || sec < words * 0.2 || sec > words * 1.2) {
    c.resent = (c.resent || 0) + 1; if (c.resent > 3) { d.stopped = "implausible audio for " + c.slug + " (" + Math.round(sec) + " s for " + c.chars + " chars)"; d.q.unshift(c.slug); d.cur = null; return ["STOP", d.stopped]; }
    c.t = Date.now(); c.started = false; const run = btn(/^Run/); if (run) run.click(); return ["stale or implausible audio, run again", c.slug, Math.round(sec)];
  }
  d.sizes.push(window.__bigblob.size);
  const name = c.slug + "-book.wav"; delete saved[name]; rx.postMessage({ name, blob: window.__bigblob }, RX);
  for (let k = 0; k < 120 && !saved[name]; k++) await sleep(300);
  if (!saved[name]) { d.errs++; if (d.errs > 4) d.stopped = "receiver not answering (click OPEN RX)"; return ["not saved", name]; }
  d.log.push([name, window.__bigblob.size, saved[name]]); d.cur = null; return ["saved", name, window.__bigblob.size];
};
window.__busy2 = false; clearInterval(window.bookTimer);
window.bookTimer = setInterval(async () => { if (window.__busy2 || bookDriver.stopped) return; window.__busy2 = true; try { bookDriver.last = await bookTick(); } catch (e) { if (bookDriver.pending && !bookDriver.cur) { bookDriver.q.unshift(bookDriver.pending); bookDriver.pending = null; } bookDriver.last = ["ERR", String(e)]; bookDriver.errs++; if (bookDriver.errs > 6) bookDriver.stopped = "too many errors: " + e; } window.__busy2 = false; }, 4000);
(() => { let b = document.getElementById("rxbtn"); if (!b) { b = document.createElement("button"); b.id = "rxbtn"; b.textContent = "OPEN RX"; b.style.cssText = "position:fixed;top:5px;left:600px;z-index:99999;padding:10px;background:#ff0;font-size:16px;color:#000"; b.onclick = () => { window.rx = window.open(RX + "/rx", "rx" + (window.RX_PORT || 8861)); }; document.body.appendChild(b); } const r = b.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })();
