// Paste into the gemini.google.com tab with javascript_tool (one call).
// Defines: sendGem(text), go(scene), fin(name), sendImg(index, name), imgCount().
// Returns the centre of the yellow "OPEN RX" button: click it with the computer
// tool (a real click) to open the receiver tab before calling fin/sendImg.
// Set window.RX_PORT before pasting when the receiver is not on 8765 (parallel runs use one port each).
// Edit PAGE_PREFIX to restate the book's characters in one line.
window.RX_PORT = window.RX_PORT || 8765;
window.PAGE_PREFIX =
  "Next picture for the book. Same characters exactly as in the character sheet, same style, landscape 4:3, absolutely no text or letters. SCENE: ";

window.imgCount = () => [...document.querySelectorAll("img")].filter((i) => i.naturalWidth > 300).length;

// Puts text in the prompt box and presses send (typing would send at the first newline).
window.sendGem = async (text) => {
  const box = document.querySelector("rich-textarea .ql-editor");
  box.focus();
  document.execCommand("selectAll");
  document.execCommand("insertText", false, text);
  await new Promise((r) => setTimeout(r, 700));
  document.querySelector('button[aria-label="שליחת הודעה"], button[aria-label="Send message"]').click();
  return "sent";
};

window.waitImg = async (n, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (imgCount() >= n) {
      await new Promise((r) => setTimeout(r, 3000)); // let the full image load
      return imgCount();
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "timeout " + imgCount();
};

// Canvas -> PNG data URL -> receiver tab -> local server. blob: fetch is blocked by Gemini's CSP.
window.saved = window.saved || {};
if (!window.__rxListen) {
  window.__rxListen = true;
  addEventListener("message", (e) => {
    if (e.origin === "http://127.0.0.1:" + window.RX_PORT) window.saved[e.data.saved] = e.data.bytes;
  });
}
window.sendImg = async (index, name) => {
  const im = [...document.querySelectorAll("img")].filter((i) => i.naturalWidth > 300)[index];
  const c = document.createElement("canvas");
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  c.getContext("2d").drawImage(im, 0, 0);
  const data = c.toDataURL("image/png");
  delete window.saved[name];
  window.rx.postMessage({ name, blob: data }, "http://127.0.0.1:" + window.RX_PORT);
  for (let k = 0; k < 20 && !window.saved[name]; k++) await new Promise((r) => setTimeout(r, 300));
  return [name, data.length, window.saved[name] || null];
};

// go: send a page prompt (fast). fin: wait up to 40 s for the new image and save it; call again on "timeout".
window.go = async (scene) => {
  window.want = imgCount() + 1;
  await sendGem(window.PAGE_PREFIX + scene);
  return window.want;
};
window.fin = async (name) => {
  const r = await waitImg(window.want, 40000);
  if (typeof r !== "number") return r;
  return await sendImg(window.want - 1, name);
};

(() => {
  let b = document.getElementById("rxbtn");
  if (!b) {
    b = document.createElement("button");
    b.id = "rxbtn";
    b.textContent = "OPEN RX";
    b.style.cssText = "position:fixed;top:5px;left:300px;z-index:99999;padding:10px;background:#ff0;font-size:16px";
    b.onclick = () => {
      window.rx = window.open("http://127.0.0.1:" + window.RX_PORT + "/rx", "rxwin" + window.RX_PORT);
    };
    document.body.appendChild(b);
  }
  const r = b.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
})();
