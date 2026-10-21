// Unattended Gemini (gemini.google.com) grid driver. Paste into a Gemini tab with javascript_exec, then real-click OPEN RX
// (the button is added at the end), then call `await tick()` once and start the timer (see the bottom).
// Needs: receiver running (python -P scripts/receiver.py <folder> <port>) with grids-<key>.json files built by
//   node scripts/build-grid-prompts.mjs <book-id> <folder>/grids-<key>.json --size=4     (2x2 sheets, 4:3, ~1024x768)
// and a watcher that cuts sheets (crop-grid.py --aspect 4:3) and runs attach-images.ts once all sheets of a book exist.
// Set RX_PORT and QUEUE (book keys) before pasting. Measured limit (2026-10-17): 13 sheets, then
// "הגעת למכסה של יצירת התמונות ... המכסה תתאפס ב-<date time>" (reset ~8:16 next morning).
// If the page reloads, the JS state is lost: re-paste, set driver.cur = {book, n, gi} to resume at sheet gi.
window.RX = "http://127.0.0.1:" + (window.RX_PORT || 8815); window.saved = {}; window.GOT = {};
addEventListener("message", (e) => { if (e.origin !== RX) return; if (e.data.got) GOT[e.data.got] = e.data.text; if (e.data.saved) saved[e.data.saved] = e.data.bytes; });
window.getFile = async (name) => { delete GOT[name]; rx.postMessage({ get: name }, RX); for (let k = 0; k < 60 && !GOT[name]; k++) await new Promise((r) => setTimeout(r, 200)); return GOT[name]; };
window.imgs = () => [...document.querySelectorAll("img")].filter((i) => i.naturalWidth > 300);
window.sendGem = async (text) => {
  const box = document.querySelector("rich-textarea .ql-editor"); if (!box) return "no box";
  box.focus(); document.execCommand("selectAll"); document.execCommand("insertText", false, text);
  await new Promise((r) => setTimeout(r, 900));
  if (box.innerText.trim().length < 20) { const dt = new DataTransfer(); dt.setData("text/plain", text); box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 900)); }
  for (let k = 0; k < 15; k++) { const b = document.querySelector('button[aria-label="שליחת הודעה"], button[aria-label="Send message"]'); if (b) { b.click(); return "sent"; } await new Promise((r) => setTimeout(r, 400)); }
  return "no send button";
};
window.gstate = { old: new Set() };
window.startGrid = async (book, i) => { const g = JSON.parse(await getFile("grids-" + book + ".json"))[i]; gstate.old = new Set(imgs().map((x) => x.src)); return [await sendGem(g.prompt), g.names.join(","), g.grid]; };
window.limitText = () => { const t = document.body.innerText.slice(-700); const m = t.match(/(reached|exceeded|הגעת|חרגת)[^.]{0,70}(limit|מגבלה|מכסה|תמונות)[^.]*\./i) || t.match(/can.t generate more images[^.]*\./i); return m ? m[0] : null; };
window.finishGrid = async (fname, ms = 34000) => {
  const t = Date.now(); let fresh = [];
  while (Date.now() - t < ms) { fresh = imgs().filter((i) => !gstate.old.has(i.src) && i.complete); if (fresh.length) break; await new Promise((r) => setTimeout(r, 2000)); }
  if (!fresh.length) return ["pending", limitText()];
  await new Promise((r) => setTimeout(r, 3500));
  const im = imgs().filter((i) => !gstate.old.has(i.src)).at(-1);
  const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d").drawImage(im, 0, 0);
  const data = c.toDataURL("image/png"); delete saved[fname]; rx.postMessage({ name: fname, blob: data }, RX);
  for (let k = 0; k < 40 && !saved[fname]; k++) await new Promise((r) => setTimeout(r, 300));
  gstate.old.add(im.src); return [fname, im.naturalWidth + "x" + im.naturalHeight, saved[fname] || null];
};
window.newChat = async () => { const a = [...document.querySelectorAll("a,button")].find((e) => /שיחה חדשה|New chat/i.test((e.getAttribute("aria-label") || "") + e.innerText)); a && a.click(); await new Promise((r) => setTimeout(r, 3500)); };
window.driver = { cur: null, queue: [...(window.QUEUE || [])], done: [], stopped: null, log: [], grids: 0 };
window.tick = async () => {
  const d = driver; if (d.stopped) return ["STOPPED", d.stopped, d.done];
  if (!d.cur) {
    const book = d.queue.shift(); if (!book) return ["QUEUE EMPTY", d.done];
    await newChat();
    const grids = JSON.parse(await getFile("grids-" + book + ".json")); d.cur = { book, n: grids.length, gi: 0 };
    const r = await startGrid(book, 0); if (r[0] !== "sent") { d.stopped = "send failed: " + r[0]; return ["STOP", d.stopped]; }
    return ["started", book, "grid 1/" + d.cur.n];
  }
  const c = d.cur; const r = await finishGrid(c.book + "-grid-" + (c.gi + 1) + ".png", 32000);
  if (r[0] === "pending") { const lim = limitText(); if (lim) { d.stopped = "limit: " + lim; return ["LIMIT", lim, d.done]; } return ["waiting", c.book, "grid " + (c.gi + 1) + "/" + c.n]; }
  if (!r[2]) return ["save problem", r];
  d.grids++; c.gi++;
  if (c.gi < c.n) { const s = await startGrid(c.book, c.gi); if (s[0] !== "sent") { d.stopped = "send failed: " + s[0]; return ["STOP", d.stopped]; } return ["saved+started", c.book, "grid " + (c.gi + 1) + "/" + c.n]; }
  d.done.push(c.book); d.cur = null; return ["BOOK DONE", c.book, d.done];
};
// Start unattended: 
window.startAuto = () => { window.__busy = false; clearInterval(window.autoTimer); window.autoTimer = setInterval(async () => { if (window.__busy || driver.stopped) return; window.__busy = true; try { driver.last = await tick(); } catch (e) { driver.last = ["ERR", String(e)]; driver.errs = (driver.errs || 0) + 1; if (driver.errs > 5) driver.stopped = "too many errors: " + e; } window.__busy = false; }, 5000); return "auto on"; };
(() => { let b = document.getElementById("rxbtn") || document.createElement("button"); b.id = "rxbtn"; b.textContent = "OPEN RX";
  b.style.cssText = "position:fixed;top:5px;left:300px;z-index:99999;padding:10px;background:#ff0;font-size:16px;color:#000";
  b.onclick = () => { window.rx = window.open(RX + "/rx", "rx" + (window.RX_PORT || 8815) + (window.TAB || "a")); }; document.body.appendChild(b);
  const r = b.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })();
