// ElevenLabs image generation driver (free plan ~10,000 credits a month). Paste into https://elevenlabs.io/app/image-video?platform=creative&modality=image
// with javascript_tool AFTER setting the composer by real clicks: model "GPT Image 2.5 Sunburst", aspect 4:3, resolution 2K, quality High,
// generations 1, prompt improvement "Off" (423 credits per grid at 2K, 238 at 1K; the tooltip on "N left" shows cost and images left).
// Receiver: python -P receiver.py <folder> <port> (accepts elevenlabs.io and serves grids-<key>.json files). Set window.RX_PORT first.
// Files saved as <key>-grid-<n>.png. The history card is only a 1024 px thumbnail: the detail modal holds the real 2048x1536 image.
window.RX = "http://127.0.0.1:" + (window.RX_PORT || 8821); window.saved = {}; window.GOT = {};
if (!window.__l) { window.__l = 1; addEventListener("message", (e) => { if (e.origin !== RX) return; if (e.data.got) GOT[e.data.got] = e.data.text; if (e.data.saved) saved[e.data.saved] = e.data.bytes; }); }
window.getFile = async (name) => { delete GOT[name]; rx.postMessage({ get: name }, RX); for (let k = 0; k < 60 && !GOT[name]; k++) await new Promise((r) => setTimeout(r, 200)); return GOT[name]; };
window.genImgs = () => [...document.querySelectorAll("img")].filter((i) => /storage\.googleapis\.com/.test(i.src) && i.naturalWidth > 500 && i.complete);
window.left = () => { const t = document.body.innerText.match(/(\d+)\s+left/); return t ? +t[1] : null; };
window.sendText = async (text) => {
  const box = document.querySelector(".ProseMirror[contenteditable=true]"); if (!box) return "no box";
  box.focus(); document.execCommand("selectAll"); document.execCommand("insertText", false, text);
  await new Promise((r) => setTimeout(r, 900));
  if (box.innerText.trim().length < 50) { const dt = new DataTransfer(); dt.setData("text/plain", text); box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 900)); }
  const b = document.querySelector('button[aria-label="Generate"]'); if (!b || b.disabled) return "no generate button"; b.click(); return "sent";
};
window.state = { old: new Set() };
window.startGrid = async (book, i) => { const g = JSON.parse(await getFile("grids-" + book + ".json"))[i]; const r = await sendText(g.prompt); await new Promise((r) => setTimeout(r, 5000)); state.old = new Set(genImgs().map((x) => x.src)); return [r, g.names.join(","), g.grid, left()]; };
window.saveBlobImg = async (im, fname) => { const b = await (await fetch(im.src)).blob(); const data = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); delete saved[fname]; rx.postMessage({ name: fname, blob: data }, RX); for (let k = 0; k < 60 && !saved[fname]; k++) await new Promise((r) => setTimeout(r, 300)); return [fname, im.naturalWidth + "x" + im.naturalHeight, saved[fname] || null]; };
window.closeModal = async () => { const c = [...document.querySelectorAll("button")].find((b) => /close/i.test(b.getAttribute("aria-label") || "")); if (c) c.click(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })); await new Promise((r) => setTimeout(r, 1200)); };
// queue: [[bookKey, gridIndex], ...]; start with: driver.q = [["pekudei",0],["pekudei",1],...]; then the autonomous timer below runs it.
window.driver = { q: [], cur: null, stopped: null, log: [], errs: 0 };
window.tick = async () => {
  const d = driver; if (d.stopped) return ["STOPPED", d.stopped];
  if (!d.cur) {
    const n = d.q.shift(); if (!n) return ["QUEUE EMPTY"]; const l = left(); if (l !== null && l < 1) { d.stopped = "no credits left"; d.q.unshift(n); return ["STOP", "credits"]; }
    await closeModal(); const r = await startGrid(n[0], n[1]); d.cur = { book: n[0], gi: n[1], t: Date.now() };
    if (r[0] !== "sent") { d.stopped = "send failed: " + r[0]; return ["STOP", d.stopped]; } d.log.push([n, "sent", r[3]]); return ["sent", n, r[3]];
  }
  const c = d.cur; const fresh = genImgs().filter((i) => !state.old.has(i.src));
  const bad = document.body.innerText.match(/not enough credits|insufficient credits|upgrade to continue|generation failed/i); if (bad) { d.stopped = "error text: " + bad[0]; return ["STOP", bad[0]]; }
  if (!fresh.length) { if (Date.now() - c.t > 240000) { d.stopped = "timeout waiting for image"; return ["STOP", "timeout"]; } return ["waiting", c.book, c.gi + 1]; }
  await new Promise((r) => setTimeout(r, 2500)); fresh[0].click();
  let full = null; for (let k = 0; k < 30 && !full; k++) { await new Promise((r) => setTimeout(r, 500)); full = [...document.querySelectorAll("img")].find((i) => i.naturalWidth >= 2000 && i.complete && /storage\.googleapis/.test(i.src)); }
  if (!full) { d.errs++; await closeModal(); if (d.errs > 4) d.stopped = "no full-res image"; return ["no full-res yet"]; }
  const r = await saveBlobImg(full, c.book + "-grid-" + (c.gi + 1) + ".png"); for (const i of genImgs()) state.old.add(i.src);
  await closeModal(); d.log.push([c.book, c.gi + 1, r[1], r[2]]); d.cur = null; return ["saved", c.book, c.gi + 1, r[1]];
};
window.__busy = false; clearInterval(window.autoTimer);
window.autoTimer = setInterval(async () => { if (window.__busy || driver.stopped) return; window.__busy = true; try { driver.last = await tick(); } catch (e) { driver.last = ["ERR", String(e)]; driver.errs++; if (driver.errs > 6) driver.stopped = "too many errors: " + e; } window.__busy = false; }, 5000);
// real-click the injected yellow button once so the receiver tab opens (window.rx):
(() => { let b = document.getElementById("rxbtn"); if (!b) { b = document.createElement("button"); b.id = "rxbtn"; b.textContent = "OPEN RX"; b.style.cssText = "position:fixed;top:5px;left:600px;z-index:99999;padding:10px;background:#ff0;font-size:16px;color:#000"; b.onclick = () => { window.rx = window.open(RX + "/rx", "rx" + (window.RX_PORT || 8821)); }; document.body.appendChild(b); } const r = b.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })();
