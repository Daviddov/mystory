// One-off: copy the narration of one language version from a local book to its live Supabase copy
// (audio files + each page's version audio, timings and source). Hebrew pages and audio are untouched.
//   npx tsx --env-file=.env.supabase scripts/_push-translation-audio.ts <book id> <language>
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";
import { pageVersion, withPageVersion, type BookLanguage } from "../src/lib/types";

const [id, language] = process.argv.slice(2) as [string, BookLanguage];
(async () => {
  const local = await new LocalRepository(dataDir()).getBookById(id);
  const remote = await createSupabaseRepository();
  const live = await remote.getBookById(id);
  if (!local || !live) throw new Error("missing " + id);
  const localMedia = new LocalMediaStore(dataDir());
  const remoteMedia = await createSupabaseMediaStore();
  let copied = 0;
  const pages = [];
  for (const [i, page] of live.pages.entries()) {
    const mine = pageVersion(local, local.pages[i], language);
    const theirs = pageVersion(live, page, language);
    if (!mine?.audio || !theirs || mine.text !== theirs.text) {
      pages.push(page);
      continue;
    }
    const obj = await localMedia.get(mine.audio);
    if (!obj) throw new Error("no local file " + mine.audio);
    await remoteMedia.put(mine.audio, obj.bytes, contentTypeForPath(mine.audio));
    pages.push(withPageVersion(live, page, language, { ...theirs, audio: mine.audio, wordTimings: mine.wordTimings, audioSource: mine.audioSource }));
    copied++;
  }
  await remote.replacePages(id, pages);
  const after = await remote.getBookById(id);
  console.log(`${language} audio on ${copied} pages; Hebrew audio kept on ${after?.pages.filter((p) => p.audio).length}`);
})();
