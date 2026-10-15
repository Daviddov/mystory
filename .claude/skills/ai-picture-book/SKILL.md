---
name: ai-picture-book
description: Write a new Hebrew rhyming picture book for the mystory library from a story idea, illustrate it in Gemini's website (gemini.google.com through the user's Chrome, NOT the image API), and publish it with nikud and narration. Use when the user asks to create/write a story or book "בסגנון דוקטור סוס", "תיצור סיפור", "תבקש מג'מיני שיצייר", "תכניס את הסיפור למערכת", or gives a plot for a new children's book. Also covers animating book pages for free in Google Flow's web UI ("תנפיש את העמודים", "איורים חיים", "קליפ ב-Flow").
---

# AI picture book: story → Gemini pictures → library

The whole flow, as done for "ככה אוגרת אומרת!" (`ai-hamster-plutzi`). Expect ~30–40 minutes.
Work in a scratch folder `<scratchpad>/<short-name>/` (`spec.json`, `img/`).

Split the work like this (the user asked for agents last time):
- **You**: write the story, drive Gemini in the browser (one browser session, cannot be parallelised).
- **Agent A (background, read-only)**: review the images while you keep generating.
- **Agent B (background)**: import, nikud review, narration — once all images exist.

## 1. Write the story

Read [references/seuss-principles.md](references/seuss-principles.md) and apply it. Keep the user's plot, their key lines
and their ending, even a cheeky one; you may add a small twist that the picture tells.

Write `spec.json` (format: [references/spec-example.json](references/spec-example.json)):
- `pages[]`: 10–14 pages, each `{text, alt, scene}`. `text` is Hebrew with `\n` between lines, no nikud
  (except on invented sound words like פְּרִי-פְּרִי). `alt` is a short Hebrew description. `scene` is an English scene for Gemini.
- Book metadata: `id` (`ai-<latin-slug>`), `slug` (latin transliteration of the title), `title`, `summary`,
  `categories` (from `CATEGORIES` in `src/lib/taxonomy.ts`), `themes` (from `THEMES`), Hebrew `tags`, 3–4 `discussionQuestions`, `ageGroup`.
- `style`, `characters` and `coverScene`: the fixed English description sent to Gemini (see the example). Give each character
  1–2 unmistakable props (bow, glasses, whistle, polka dots) and fixed clothes per setting.

## 2. Pictures in Gemini (Claude in Chrome)

Load the `anthropic-skills:chrome-browser` skill and the Chrome tools (include `javascript_tool`, `find`, `browser_batch`).
Open a new tab at `https://gemini.google.com/app` (the user is signed in).

Gotchas learned the hard way:
- **Model**: open the mode picker under the prompt box and choose **Flash**. The "Thinking"/"מעמיק" mode bounced the chat back to an empty page.
- **Never type newlines** into the prompt box: Enter sends the message. Send prompts with the JS helper instead of typing.
- **Gemini's download button saves only the first image**; Chrome blocks the rest. Gemini's CSP also blocks `fetch` to localhost and `fetch` of its own `blob:` image URLs. What works: draw the `<img>` on a canvas → data URL → `postMessage` to a local receiver tab → it POSTs to a local server that writes the file.
- A JS call longer than ~45 s times out. Send the prompt in one call, collect the image in a second call.

Steps:
1. Start the receiver in the background (writes into your `img/` folder):
   `python -I <skill>/scripts/receiver.py "<scratch>\img"` (port 8765, `run_in_background`).
2. Paste [scripts/gemini-helpers.js](scripts/gemini-helpers.js) into the Gemini tab with `javascript_tool`. It returns the
   centre of a yellow **OPEN RX** button. Click that button with the `computer` tool (a real click; a scripted
   `window.open` is blocked as a popup). A tab `http://127.0.0.1:8765/rx` opens.
   If that tab is closed or reloaded later, `rx.closed` turns true: click the button again.
3. First message, built from `spec.style` and `spec.characters` in one paragraph:
   `await sendGem("Create an image. We are illustrating a children's picture book, one image per message, same style and characters on every image. STYLE: ... CHARACTERS: (1) ... (2) ... First, make a character sheet: the characters side by side, full body, plain background.")`.
   Look at it. If a character got a wrong prop (last time Mom got the girl's bow), correct it in the next prompt and,
   better, ask for a corrected sheet before going on: every later page copies the sheet.
4. Cover: `await go("BOOK COVER: " + coverScene)` then `await fin("cover.png")`.
5. Each page: `await go(scene)` then `await fin("page-01.png")`. If `fin` returns `timeout ...`, call it again.
   `fin` returns `[name, dataUrlLength, savedBytes]`; `savedBytes` null means the receiver tab is gone (step 2).
6. Glance at each result (`Read` the PNG). Regenerate only for real problems: text/letters in the picture, wrong
   main character, unreadable scene. To redo page N: `await go("Redo that picture: ...")`, then `fin` with the same name.
7. After page ~5, start **Agent A** (general-purpose, background) to review the images in `img/` against `spec.json`
   scenes: no text, scene readable, characters consistent, nothing unsuitable for small kids. Report only; no edits.
8. When done: stop the receiver task, close the tabs you created. The Gemini chat stays in the user's history.

Images come out 1024×765 PNG; the import step upscales them to 1200 wide JPEG.

## 3. Import, nikud, narration (Agent B)

Hand this to a background agent with the scratch path. It runs from the project root:

```bash
python .claude/skills/ai-picture-book/scripts/convert-images.py "<scratch>/img" data/media/books/<id>
npx tsx .claude/skills/ai-picture-book/scripts/create-book.ts "<scratch>/spec.json"
npx tsx scripts/narrate.ts <slug>
```

- `create-book.ts` creates the book through `LocalRepository.createBook` (validated, published, owner = the user's
  account `u_m3ipvar7h1mb`, origin `ai`, same credit wording as the other AI books). It refuses an existing id.
- `narrate.ts` uses `.env.local` providers: Dicta nikud + ElevenLabs TTS.
- Then **review the nikud** in `data/books/<slug>/book.json` (`textNikud`) and fix by hand. Dicta's usual mistakes:
  invented names (פלוצי came out פְלוֹצֵי), the gender of "you" when a girl talks to Mom or the teacher
  (אִיתְּךָ → אִיתָּךְ, שֶׁאָמַרְתָּ → שֶׁאָמַרְתְּ), שׂ/שׁ mix-ups (בְּשׂוֹרָה → בְּשׁוּרָה), and stray vowels on
  ו/ו (אָוזְנַיִים, אֲרֻוכּוֹת). Keep each page's `wordTimings` words in step with the edited `textNikud`.
- Re-record only the fixed pages: `npx tsx scripts/narrate.ts <slug> --force --pages 2,5,12`.
- ElevenLabs credits run out quickly (13 pages + one re-record used almost all). If narration fails with
  `quota_exceeded`, keep the fixed text and tell the user the command to re-run later.
- `data/books/*` and `data/media/books/*` are git-ignored, so nothing shows in `git status`. Don't commit.

## 4. Verify

The user's `next dev` is usually already running on port 3000 (a second `next dev` exits). Open
`http://localhost:3000/book/<slug>` in the built-in browser (`preview_start` with `url`) and check the title, cover
and page count; open `/read/<slug>` for the pages and audio.

Report to the user: the link, the story idea in two lines, what the agents found, and anything left
(e.g. a page whose narration still needs re-recording, with the command).

## 5. Optional: living pictures in Google Flow (free, web UI)

Only when the user asks. Animate 3–4 key pages per book, not all: the free quota is 50 credits a day
(Omni 1.1 Flash 4 s = 7 credits, so ~7 clips/day). Free accounts may get no video around 17:00–20:00 Israel time.
One clip at a time, human pace (Google's terms restrict automated use). Tested on 2026-10-15, page 13 of `kacha-ogeret-omeret`.

1. Chrome tab at `https://labs.google/fx/tools/flow` → **פרויקט חדש**. The first visit shows a welcome dialog
   (leave the marketing and research boxes unchecked), then a privacy notice, then later an image-rights
   confirmation on the first upload. **Accepting the notice and the rights confirmation needs the user's explicit yes.**
2. Flow is a chat agent. Settings (sliders icon under the chat box): video 16:9 only (9:16 also exists), x1,
   model **Omni 1.1 Flash** (Veo 3.1 Lite on the free tier only does 8 s). Keep "approval before generation: always".
3. Upload the page picture without the native file picker: first patch the input in the Flow tab with
   `javascript_tool`:
   `HTMLInputElement.prototype.click = function(){ if (this.type==='file'){ if(!this.isConnected) document.body.appendChild(this); return; } }`
   then open **+ (menu for adding media) → העלאה**, `find` the file input and `file_upload` the JPEG from
   `data/media/books/<id>/page-NN.jpg`.
4. In the chat, one paragraph (no newlines): "Animate the picture I uploaded into a 4-second video with Omni 1.1 Flash,
   16:9, 720p. Use it as BOTH the first and the last frame so it loops seamlessly. Keep the exact style, framing and colors,
   no camera movement, no new objects, no text. Gentle subtle motion only: <who moves and how>. Silent."
   Flow answers with a cost card (7 credits): click **אישור**. Clips may wait in a queue a minute or two.
5. Save the clip: in the Flow tab, `fetch(video.currentSrc)` works (keep the Blob in `window.__clip`). Localhost is
   blocked, so use the receiver as with Gemini: start `receiver.py <scratch>/video`, add the OPEN RX button
   (same snippet as in gemini-helpers.js), real-click it, then `rx.postMessage({name:'page-NN.mp4', blob: window.__clip}, 'http://127.0.0.1:8765')`.
6. Attach it: `npx tsx .claude/skills/ai-picture-book/scripts/attach-clip.ts <slug> <page-number> <clip.mp4>`
   (strips the audio with ffmpeg, writes `animation-NN-<hash>.mp4`, sets `video`/`videoImageHash`/`videoSource: "ai"`
   like `scripts/animate.ts`).

What the test showed: 1280×720, 24 fps, 4.0 s; no visible watermark on the free account (SynthID stays);
first and last frames match closely (a smooth loop). The 4:3 picture is cropped to 16:9, so the top of tall
things (Plutzi's ears) is cut: for pages meant to be animated, keep heads and ears away from the top and bottom edges.
