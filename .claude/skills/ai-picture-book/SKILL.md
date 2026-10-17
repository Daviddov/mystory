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

Images come out 1024×765 PNG; the import step stores them as WebP (same size) and keeps the PNGs in
`data/originals/media/books/<id>/`.

### Grid mode: four pictures per generation (use it when the daily quota is the limit)

Ask the model for **one image holding a 2x2 grid of four separate scenes** (plain white gutters, no frames, no text),
then cut it with `scripts/crop-grid.py` (`--aspect 4:3` for book pages). **ChatGPT (free) with a 3x3 grid is the best route found**:
   a whole book in 2 generations, see `references/torah-books-daily-routine.md`. One generation gives four pictures, so a 13-page book needs 4 generations
instead of 13 (the free AI Studio quota is ~11 generations a day: ~44 pictures).
1. Character sheet first, in the same chat (one generation).
2. `window.SCENES = {...}` then `await send_grid(["page-01","page-02","page-03","page-04"])` and `await collect("grid-01.png")`
   (helpers in [scripts/aistudio-helpers.js](scripts/aistudio-helpers.js); `gemini-helpers.js` users can send the same text with `go`).
3. `python -P scripts/crop-grid.py <img>/grid-01.png 2x2 <img> page-01,page-02,page-03,page-04` (finds the plain gutters, trims 6 px).
4. Look at the four panels; regenerate a single page alone only if it is clearly wrong.
Trade-offs: each panel is about 590x440 px (the import step upscales to 1200 wide, so pictures are softer; set the
resolution to 2K/4K in the AI Studio run settings if it is allowed on the free tier, untested) and busy scenes or
one character in four poses may drift more. Keep a cover as a single full-size picture.

## 3. Import, nikud, narration (Agent B)

Hand this to a background agent with the scratch path. It runs from the project root:

```bash
npx tsx .claude/skills/ai-picture-book/scripts/create-book.ts "<scratch>/spec.json" "<scratch>/img"
npx tsx scripts/narrate.ts <slug>
```

- `create-book.ts` stores `cover.png` and `page-NN.png` from the folder as WebP (`src/lib/media/optimize.ts`, like
  every picture the site saves), then creates the book through `LocalRepository.createBook` (validated, published, owner = the user's
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

Only when the user asks. The free quota is 50 credits a day (Omni 1.1 Flash 4 s = 7 credits, so ~6–7 clips a day):
a whole 13-page book takes about two days. Tell the user that up front. Free accounts may get no video around 17:00–20:00 Israel time.
One clip at a time, human pace (Google's terms restrict automated use). Tested on 2026-10-15, page 13 of `kacha-ogeret-omeret`.

1. Chrome tab at `https://labs.google/fx/tools/flow` → **פרויקט חדש**. The first visit shows a welcome dialog
   (leave the marketing and research boxes unchecked), then a privacy notice, then later an image-rights
   confirmation on the first upload. **Accepting the notice and the rights confirmation needs the user's explicit yes.**
2. Flow is a chat agent. Settings (sliders icon under the chat box): video 16:9, x1, model **Omni 1.1 Flash**
   (Veo 3.1 Lite on the free tier only does 8 s). Keep "אישור לפני יצירה: תמיד" (always ask).
3. **Frame every page as 16:9 first** (otherwise Flow crops the top and bottom, and the reader then crops the sides too):
   the 4:3 original `data/originals/media/books/<id>/page-NN.png` (the served `page-NN.webp` is smaller) resized to
   964×720, centered on a 1280×720 cream (253,246,231) canvas, saved as `page-NN-16x9.jpg`.
   The reader shows a clip in the picture's 4:3 box with object-cover, so the margins are cut away exactly.
4. Upload without the native file picker: patch the input in the Flow tab with `javascript_tool`:
   `HTMLInputElement.prototype.click = function(){ if (this.type==='file'){ if(!this.isConnected) document.body.appendChild(this); window.__cap=this; return; } }`
   then **+ (top bar) → העלאה**, `find` the file input and `file_upload` all the framed pages in one call (it takes many).
5. Motion prompts: have an agent write one per page into `motion.json` (2–3 gentle motions of things in that picture
   that return to the start pose). Then **one clip per chat message** (a 6-clip message hung for minutes). Paragraph, no newlines:
   "Make ONE video with Omni 1.1 Flash, 4 seconds, 16:9, 720p, from the uploaded image page-NN-16x9.jpg. Use that image as
   BOTH the first and the last frame so it loops seamlessly. Keep the exact cartoon style, framing and colors; no camera
   movement, no new objects, no text, silent; the plain cream margins on the left and right stay plain and unchanged. Motion: ..."
   Put it in the `.ProseMirror` box with `execCommand('insertText')`, then real-click the send arrow (a scripted click or
   Enter does not send).
6. **Careful with the cost card** (7 credits): it offers אישור / אישור לתמיד / דחייה. Zoom on it and click **אישור** by
   its on-screen position. Twice a click landed on "אישור לתמיד" (once through a `find` ref whose labels were off), which
   switches the setting to "never ask". After each approval, check the chat says "אישור"; if it says "אישור לתמיד", open
   settings and set it back to "תמיד" at once.
   - The send arrow becomes a **stop** button while Flow works: don't click there until it is idle again (the chat
     ends with `arrow_forward`, not `stop`), or you cancel the reply.
   - "הפעולה לא הצליחה" after approving is usually wrong: the clip appears in **סרטונים** a minute later. Check there before retrying.
   - "הגעת למכסת השימוש" = the day's credits are gone. Stop and continue the next day.
7. Save each clip: in **סרטונים**, hover a tile so its `<video>` mounts, `fetch(video.currentSrc)` → Blob, then via
   the receiver (localhost is blocked here too): start `receiver.py <scratch>/video`, add the OPEN RX button (snippet in
   gemini-helpers.js), real-click it, `rx.postMessage({name:'page-NN.mp4', blob}, 'http://127.0.0.1:8765')`.
   The newest clip is top-right in the grid; let the checking agent confirm the page.
8. A background agent per clip (or two) checks and attaches while you make the next one: 1280×720 ~4 s; margins still
   plain; centre 964×720 of frame 0 vs the page picture (mean abs diff ~6–8 for the right page, ~70 for others);
   first-vs-last diff ~2 (smooth loop); a 3-frame strip for glitches. Then
   `npx tsx .claude/skills/ai-picture-book/scripts/attach-clip.ts <slug> <page-number> <clip.mp4>`
   (strips the audio, writes `animation-NN-<hash>.mp4`, sets `video`/`videoImageHash`/`videoSource: "ai"` like `scripts/animate.ts`).
   If Flow painted into the margins but the centre matches, crop `crop=964:720:158:0` before attaching.

Results so far (2026-10-15, `kacha-ogeret-omeret`): clips are 1280×720, 24 fps, 4.0 s, with a sound track (stripped);
no visible watermark on the free account (SynthID stays); loops are smooth; with the margin framing the picture
lines up exactly. Quota: page 13 + pages 1–5 used the day's 50 credits (one failed attempt may also have cost credits).

### Backup when Flow's daily quota runs out: Kling (free, web UI)

Tested 2026-10-17 on page 13 of `kacha-ogeret-omeret`; Flow stays the first choice. `kling.ai/app` (Chrome, user signs in):
66 free credits. **Video Generation → Keyframes**, model **Kling 2.5 Turbo**, 720p, 5 s, 16:9, first frame only
(15 credits; a last frame forces 1080p, which is paid, so no seamless loop). Use the same `page-NN-16x9.jpg` framing and
motion prompt as Flow. Upload via `file_upload` into the First Frame input, then **First Frame → Asset → Uploads**.
The free queue takes ~8 min. Result: 1280×720, 24 fps, 5 s, gentler motion than Flow, a **"KlingAI" watermark** at the
bottom right (lands in the cream margin, which the reader crops away, but the free tier is not licensed for commercial use).
The clip URL is the page's `<video>.currentSrc`; `curl` it, then `attach-clip.ts` as for Flow.
