"""Local receiver for images pulled out of gemini.google.com.

    python -I receiver.py <output-folder> [port]      (listens on 127.0.0.1:<port>, default 8765)

GET /rx serves a tiny page. The Gemini tab opens it with window.open and sends
{name, blob} via postMessage, where blob is a data: URL. The page POSTs it here
and this server writes <output-folder>/<name>. Only messages from
Gemini and Flow (gemini.google.com, aistudio.google.com, chatgpt.com, elevenlabs.io, flow.google.com, labs.google) are accepted, and only plain file names are written.
"""
import base64
import http.server
import os
import sys

OUT = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
os.makedirs(OUT, exist_ok=True)

RX = """<!doctype html><title>rx</title><body>receiver<script>
addEventListener('message', function (e) {
  var ok = ['https://gemini.google.com', 'https://aistudio.google.com', 'https://chatgpt.com', 'https://elevenlabs.io', 'https://flow.google.com', 'https://labs.google'];
  if (ok.indexOf(e.origin) < 0) return;
  var src = e.source, from = e.origin;
  if (e.data.get) {  // the page asks for a text file from the output folder (prompts), e.g. {get: 'grids.json'}
    fetch('/' + e.data.get).then(function (r) { return r.text(); }).then(function (t) {
      src.postMessage({got: e.data.get, text: t}, from);
    });
    return;
  }
  var name = e.data.name;
  fetch('/' + name, {method: 'POST', body: e.data.blob}).then(function (r) { return r.text(); }).then(function (t) {
    document.body.append(' ' + name + ':' + t);
    src.postMessage({saved: name, bytes: t}, from);
  });
});
</script>"""


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        name = os.path.basename(self.path.strip("/"))
        if name and name != "rx" and os.path.isfile(os.path.join(OUT, name)):
            body = open(os.path.join(OUT, name), "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(RX.encode())

    def do_POST(self):
        name = os.path.basename(self.path.strip("/"))
        if not name or name.startswith("."):
            self.send_response(400)
            self.end_headers()
            return
        data = self.rfile.read(int(self.headers["Content-Length"]))
        if data.startswith(b"data:"):
            data = base64.b64decode(data.split(b",", 1)[1])
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(str(len(data)).encode())


print(f"receiver on http://127.0.0.1:{PORT}/rx -> {OUT}", flush=True)
http.server.HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
