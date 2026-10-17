// Paste into an aistudio.google.com chat tab (model Nano Banana 2 Lite, the only free image model)
// with javascript_tool. Free quota measured on 2026-10-15: ~11 images per day, reset at midnight
// Pacific time; it then fails with "quota exceeded: you have reached the daily limit".
// Set window.SCENES = {name: "scene text"} and window.PRE (prompt prefix) before calling send().
// Flow per image: await send(name) -> await collect(name + ".png") (<= ~38 s each; call again on "pending").
// Images are data: URLs, so no canvas is needed; the receiver (receiver.py <dir> <port>) must accept aistudio.google.com.
window.RX_PORT = window.RX_PORT || 8791;
window.RX = "http://127.0.0.1:" + window.RX_PORT;
window.ERRRE = /exceeded|RESOURCE_EXHAUSTED|rate limit|something went wrong|failed to generate|An internal error|daily limit/i;
window.nImgs = () => [...document.querySelectorAll("img")].filter((i) => i.naturalWidth > 200 && i.src.startsWith("data:image"));
window.lastSig = () => { const l = nImgs().slice(-1)[0]; return l ? l.src.length + ":" + l.src.slice(-80) : ""; };
window.asSend = async (text) => {
  const ta = document.querySelector('textarea[aria-label="Enter a prompt"]');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, text);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 600));
  [...document.querySelectorAll("button")].find((b) => /^Run/.test(b.innerText.trim())).click();
};
window.saved = {};
addEventListener("message", (e) => { if (e.origin === RX) window.saved[e.data.saved] = e.data.bytes; });
window.saveLast = async (name) => {
  const im = nImgs().slice(-1)[0];
  delete window.saved[name];
  window.rx.postMessage({ name, blob: im.src }, RX);
  for (let k = 0; k < 30 && !window.saved[name]; k++) await new Promise((r) => setTimeout(r, 300));
  return [name, im.naturalWidth + "x" + im.naturalHeight, window.saved[name] || null];
};
// Detects the finished image by comparing the last image with the one seen before sending.
window.send = async (name) => { window.pendingSig = lastSig(); await asSend((window.PRE || "") + window.SCENES[name]); return "sent " + name; };
window.collect = async (file, ms = 38000) => {
  const t = Date.now();
  while (Date.now() - t < ms && lastSig() === pendingSig) {
    const m = document.querySelector("ms-chat-session, main")?.innerText.match(ERRRE);
    if (m) return ["ERR", m[0]];
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (lastSig() === pendingSig) return ["pending"];
  await new Promise((r) => setTimeout(r, 1500));
  return await saveLast(file);
};
(() => {
  let b = document.getElementById("rxbtn");
  if (!b) {
    b = document.createElement("button"); b.id = "rxbtn"; b.textContent = "OPEN RX";
    b.style.cssText = "position:fixed;top:5px;left:600px;z-index:99999;padding:10px;background:#ff0;font-size:16px;color:#000";
    b.onclick = () => { window.rx = window.open(RX + "/rx", "rx" + RX_PORT); };
    document.body.appendChild(b);
  }
  const r = b.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; // real-click this point
})();

// GRID MODE (default for free quota): one generation = 4 pictures in a 2x2 sheet, cut afterwards with
// scripts/crop-grid.py. Usage: set SCENES, then
//   await send_grid(["page-01","page-02","page-03","page-04"]) ; await collect("grid-01.png")
//   python -P crop-grid.py <img>/grid-01.png 2x2 <img> page-01,page-02,page-03,page-04
window.gridPrompt = (names) => {
  const pos = ["top-left", "top-right", "bottom-left", "bottom-right"];
  return (
    "Create ONE single image: a 2x2 grid of four SEPARATE illustrations for a children's picture book, 2 columns and 2 rows, " +
    "with a plain solid white gutter about 4% wide between the panels and around the outside. Each panel is a complete, " +
    "full-bleed 4:3 picture with no frame, no border and no caption. Same characters exactly as in the character sheet above and the same " +
    "style in all four. No text, letters or numbers anywhere. " +
    names.map((n, i) => `PANEL ${pos[i]}: ${window.SCENES[n]}`).join(" ")
  );
};
window.send_grid = async (names) => { window.pendingSig = lastSig(); await asSend(gridPrompt(names)); return "sent grid " + names.join(","); };
