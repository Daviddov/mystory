# Pictures for the existing parasha / chazal books (free quota routine)

Status on 2026-10-15: 79 books exist without pictures (61 parasha, 18 chazal). Prompts are ready in
`scripts/originals/illustrations/prompts/<id>.md`; the order of work is `scripts/originals/illustrations/daily-queue.json`
(by the Shabbat each parasha is read in Israel).

## Measured limits
- AI Studio, model **Nano Banana 2 Lite** (only free image model): **~11 images per day**, then
  "quota exceeded: daily limit". Resets at midnight Pacific (about 10:00 Israel time in summer time).
- Gemini app: ~2-3 images before the limit. Pollinations (anonymous): blurry, ignores the scene,
  watermark, one request per 45 s: rejected. Paid API: ~$0.034 per image (~$37 for all).
- Extra Google accounts to widen the quota are against the terms: don't.

## Daily routine (11 generations = up to 44 pictures with grid mode)
1. `node scripts/extract-prompts.mjs <id> <scratch>/<id>/prompts.json` for the book(s) of the day.
2. `python -I .claude/skills/ai-picture-book/scripts/receiver.py <scratch>/<id>/img 8791` (background).
   Port 8765 may be taken by another session's receiver: always pass a port.
3. AI Studio tab with model `gemini-3.1-flash-lite-image` (`?model=gemini-3.1-flash-lite-image`), choose
   "Cancel and use Temporary chat" if asked about Drive. Paste `scripts/aistudio-helpers.js`, real-click OPEN RX.
4. Covers need no character sheet. For a full book send the character sheet first (same chat = same characters).
4b. **Grid mode:** send pages four at a time as a 2x2 sheet (`send_grid`) and cut with `scripts/crop-grid.py` (see SKILL.md, section 2).
    Quality is lower per picture (about 590x440 px): keep covers single.
5. Finish a book before starting the next; images arrive as page-NN.png / cover.png.
6. When all pages exist: `npx tsx scripts/attach-images.ts <book-id-or-slug> <img-folder> [--publish]`.
7. Stop at the first "quota" error and note which page is next.

## Day 1 plan
Noah pages 09-13 (chat `Noah's Ark Character Sheet` in AI Studio history may still hold the sheet), then covers:
lech-lecha, vayera, vayera-akedah, vayera-sodom, chayei-sarah, toldot.
Already saved for Noah (scratch of 2026-10-15): sheet, cover, page-01..08 (page-05 lacks Noah himself: regenerate if time).

## ChatGPT (free plan) test, 2026-10-15
- Logged-in free account in Chrome: single image 1448x1086 (4:3) in ~25 s, painterly quality, Noah consistent; a 4x4 grid
  of 16 scenes came out as one 1536x1024 image (~70 s) with clean white gutters: `crop-grid.py` cut all 16, but each panel
  is only ~373x245 px (too small for a page). 2x2 would give ~750x500 per panel, 3x3 ~500x330.
- Free daily limit not measured (no limit message after 2 images).
- Saving from chatgpt.com: `fetch(img.src)` -> FileReader data URL -> `postMessage` to the receiver tab (receiver.py now accepts
  chatgpt.com); a direct fetch to localhost is blocked by the site's CSP.

## ChatGPT grid flow (best so far, 2026-10-15): a whole 13-page book in 2 generations
Measured on the free account: `parasha-noach` and `parasha-lech-lecha` finished and attached in ~5 min each,
quality clearly above AI Studio, characters stay consistent inside one grid. No daily limit hit after 6 images
(limit still unmeasured). Panels come out ~450x340 (3:2 cells cropped to 4:3, upscaled to 1200 wide: soft but fine for a reader).
1. `node scripts/build-grid-prompts.mjs <book-id> <scratch>/<id>/grids.json` → `[{names, grid, prompt}]`
   (first grid = cover + pages 1-8 as 3x3, the rest 3x3 or 2x2). Cover is a panel of grid 1.
2. receiver: `python -P scripts/receiver.py <scratch>/chatgpt 8791` (accepts chatgpt.com). In the ChatGPT tab (new chat per
   book) paste a small helper: box = `.ProseMirror[contenteditable=true]`, `document.execCommand('insertText')`, then click
   `button[data-testid="send-button"]`; the finished picture is `img[alt^="Generated image"]` (blob: URL: fetch → FileReader
   data URL → `rx.postMessage({name, blob}, "http://127.0.0.1:8791")`; open the rx tab with a real click on an injected button).
3. Send grid 1, wait for "Response complete" (1.5-3 min, a progress "99%" is normal), save, send the next grid in the same chat.
   Check the saved file differs from the previous one (the DOM can hold the old image while the new one renders).
4. `python -P scripts/crop-grid.py <grid.png> 3x3 <img-folder> cover,page-01,... --aspect 4:3`, then
   `npx tsx scripts/attach-images.ts <book-id> <img-folder>` (draft).
Free account sign-in and the terms screen needed the user's own approval once.

## Measured ChatGPT free limit (2026-10-15/16)
26 images (grids) in ~3.5 h (23:35-01:01), then "You're out of image creations for now ... limit resets in 23 hours".
≈ 13 books per day at 2 grids per book. Two parallel tabs both hit it at the same time (one shared account limit).
Driver pattern that worked unattended: a `setInterval` state machine in each ChatGPT tab (send grid -> wait for a fresh
`img[alt^="Generated image"]` -> save through the receiver -> next grid / next book) plus a Python watcher that cuts and attaches
finished books. Sending text in a background tab needs the synthetic-paste fallback (insertText needs focus).

## Two results from ChatGPT (user request 2026-10-17)
ChatGPT sometimes returns two candidate images for one prompt. Save both (`<key>-grid-N.png` and `<key>-grid-N-alt.png`),
cut both with the same layout, and per page attach the better scene; keep the unused alternatives in `data/media/_alt/<book-id>/`.
No extra generations just to get alternatives.

## Head covering rule (user, 2026-10-17, from now on)
In every Jewish story picture each man and boy always has his head covered: a kippah (modern/sages scenes), a tallit over the head,
or in ancient scenes the hood or corner of his robe/cloak drawn over his head, or a tied head-cloth. It overrides hair descriptions.
`scripts/build-grid-prompts.mjs` adds the rule to every grid prompt and `scripts/originals/illustrations/style.json` carries it;
rebuild the grids json for each book (never reuse older ones). Check every man and boy in the result; redo a grid once if one is bare-headed.
Books attached before this date are handled by the user.

## ElevenLabs as the fallback when ChatGPT's limit is hit (2026-10-17)
Free plan: ~10,000 credits shown BUT a hard DAILY limit applies: after 3 generations (1 test at 1K + 2 grids at 2K on 2026-10-17) it showed "You have reached the daily image generation limit for the free plan" and an upgrade dialog (the "N left" chip still said 21: ignore it). Model GPT Image 2.5 Sunburst, aspect 4:3, High, 1 generation, prompt improvement Off:
1K = 238 credits, **2K = 423 credits per grid** (≈ 23 grids a month ≈ 11 books); the tooltip on the "N left" chip shows cost and images left.
At 1K a 3x3 grid gives ~340x250 panels (too small); use 2K (2048x1536, ~680x510 per panel, about like ChatGPT).
Use `scripts/elevenlabs-driver.js` (autonomous queue, saves `<key>-grid-N.png` through the receiver) and the same crop/attach watcher.
The history card is a 1024 px thumbnail: open the card, the detail modal has the full 2048x1536 image (this is what the driver saves).
Sign-in needs the user (done once in Chrome). Credits are monthly: do not burn them early in the month on retries.

**Measured (2026-10-17): ElevenLabs free = about 3 generations a day** (≈ 1 book of 2 grids a day). Never click Subscribe/upgrade.
The driver's stop rule watches the dialog text ("Upgrade to continue"); close the dialog with its X.

## Gemini app as a fallback (user, 2026-10-17)
After ChatGPT, ElevenLabs and (optionally) AI Studio: the Gemini app at gemini.google.com/app (signed in, Flash mode, never type newlines).
Use 2x2 sheets: `node scripts/build-grid-prompts.mjs <id> <folder>/grids-<key>.json --size=4` (the prompt asks for a 4:3 image with four equal
panels; without it Gemini gives a 16:9 image with an uneven layout). Result 1024x768, panels ~500x380, a warm cartoon style that differs from
ChatGPT's watercolor (chazal books may look different from the parasha books). A book takes 4 sheets (cover + 13 pages).
Driver: `scripts/gemini-grid-driver.js` (autonomous queue, canvas -> receiver, stops on a limit message). Record the limit you see.
Another session ("fork") may already run Gemini for some books: check list_sessions before starting, only one Gemini run at a time.

## Gemini app grid flow (2026-10-17): works, own quota, resets in the morning
Prompts: `node scripts/build-grid-prompts.mjs <id> <folder>/grids-<key>.json --size=4` (2x2 sheets, asks for 4:3 and equal panels; a
sheet of 3 or 1 pictures is handled). Driver: `scripts/gemini-grid-driver.js` (two tabs in parallel worked; a page reload loses the JS state).
Result: sheets of 1024x768, four panels of ~500x380, clean cartoon style (different from ChatGPT's watercolor), uniform layout, head
coverings mostly present. Measured limit: **13 sheets (~50 pictures)**, then "הגעת למכסה של יצירת התמונות ... המכסה תתאפס ב-Oct 18, 8:16 AM".
Quota windows differ per tool: Gemini ~08:16, AI Studio ~10:00, ChatGPT ~21:00 (rolling). The Gemini run goes through the queue from the END
(chazal books first); ChatGPT goes from the start.
2026-10-21 run: limit again after **20 sheets**, now in English: "Sorry, I can't generate more images for you today, but come back tomorrow"
(no reset time; the driver's limitText now matches it). Seen in this run: a finished picture can arrive as a direct
`lh3.googleusercontent.com` URL instead of a blob (canvas is tainted): clicking the picture turns it into a blob that can be saved;
a reply can hang in "generating" (stop button, no send button): stop it, reload the chat and re-paste the driver.
The ChatGPT run also takes books from the end and does not check progress.json, so the same book can get done twice (the later attach wins).


## Lessons from 2026-10-21
- ChatGPT: after "New chat" the old (hidden) composer stays in the DOM; pick the *visible* `.ProseMirror` and Send button
  (filter by `getBoundingClientRect().width > 0`), otherwise the send fails with "no send button". Limit hit after 23 grids (22:00, reset next day 20:28).
- ElevenLabs: grid 2+ prompts ("Great, the same again ... Same style.") must be made standalone with grid 1's style (no chat memory);
  the history page lazy-loads old cards, so only accept a result whose `alt` starts like the prompt. Both are now in `elevenlabs-driver.js`.
  Daily limit came after 2 generations this time.
- AI Studio flash-lite-image: fine for short 2x2/3-panel sheets of simple scenes, but on a long prompt it wrote the prompt text into panels
  as captions and dropped head coverings (parasha-chukat-og): leave such books for ChatGPT. A single-picture prompt is the cleanest way to replace one bad page.
