// One-off: adds textNikud to every page of an AI picture-book spec with the site's nikud step
// (Gemini, Dicta fallback, then a Gemini proofreading pass).
//   npx tsx --env-file=.env.local scripts/_vocalize-spec.ts <spec.json>
import fs from "node:fs";
import { createDictaNikudProvider } from "../src/lib/ai/providers/dicta-nikud";
import { createGeminiNikudProvider } from "../src/lib/ai/providers/gemini-nikud";
import { createGeminiTextProvider } from "../src/lib/ai/providers/gemini-text";
import type { TextRequest } from "../src/lib/ai/types";
import { vocalizeStory } from "../src/lib/generation/nikud";

(async () => {
  const file = process.argv[2];
  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  const text = await createGeminiTextProvider();
  const nikud = await createGeminiNikudProvider({ text, fallback: await createDictaNikudProvider() });
  const ask = async <T,>(request: TextRequest<T>) => (await text.generate(request)).data;
  const result = await vocalizeStory({ nikud, ask, log: console.log }, spec.pages.map((p: { text: string }) => p.text));
  result.texts.forEach((t, i) => { if (t) spec.pages[i].textNikud = t; });
  fs.writeFileSync(file, JSON.stringify(spec, null, 2) + "\n");
  console.log(`corrected ${result.corrected}, missing ${result.missing}`);
  spec.pages.forEach((p: { textNikud?: string }, i: number) => console.log(`-- ${i + 1}\n${p.textNikud}`));
})();
