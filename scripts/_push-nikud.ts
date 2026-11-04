// One-off: copy local textNikud into Supabase books, only on pages whose plain text is identical on both sides.
//   npx tsx --env-file=.env.supabase scripts/_push-nikud.ts <ids-file>
import fs from "node:fs";
import { dataDir } from "../src/lib/config";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";

(async () => {
  const ids = fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter(Boolean);
  const local = new LocalRepository(dataDir());
  const remote = await createSupabaseRepository();
  let pushed = 0, pages = 0;
  const notRemote: string[] = [], mismatch: string[] = [];
  for (const id of ids) {
    const l = await local.getBookById(id);
    const r = await remote.getBookById(id);
    if (!l) throw new Error("no local " + id);
    if (!r) { notRemote.push(id); continue; }
    let n = 0;
    const next = r.pages.map((rp, i) => {
      const lp = l.pages[i];
      if (!lp || lp.text !== rp.text) { if (lp?.textNikud !== rp.textNikud) mismatch.push(`${id} p${i + 1}`); return rp; }
      if (lp.textNikud === rp.textNikud) return rp;
      n++; return { ...rp, textNikud: lp.textNikud };
    });
    if (n) { await remote.replacePages(id, next); pushed++; pages += n; }
  }
  console.log(`pushed ${pages} pages in ${pushed} books; ${notRemote.length} books not in Supabase`);
  if (mismatch.length) console.log("text differs, not pushed:", mismatch.join(", "));
})();
