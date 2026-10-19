/**
 * The default writing voice of every story the site writes: the Dr. Seuss
 * mechanisms, in Hebrew, with original characters (never imitation of his books).
 * Condensed from .claude/skills/ai-picture-book/references/seuss-principles.md.
 *
 * Added to every story-writing prompt (outline, pages, revision, the studio's
 * "write with AI" stage), whatever the parent asked for. The parent's idea
 * decides WHAT happens; this decides HOW it is told.
 *
 * Client-safe: plain strings only.
 */

export const SEUSS_PRINCIPLES = [
  "Default writing voice (always apply it, whatever the story idea): write like Dr. Seuss, using his mechanisms in Hebrew with original characters and never copying his books.",
  "Core rule: let the child learn the game fast, then surprise them again and again inside the game they learned. Every page has something the child can predict and something they did not expect.",
  "1. The problem starts on page 1: no introduction. The conflict is small and clear.",
  "2. Rhythm first: lines of similar length and beat, so that it feels like a song when read aloud.",
  "3. Rhyme that creates anticipation: end the line on the rhyming word, so the child can guess it (Hebrew endings that rhyme easily: ־ת/־בת, ־ה, ־ום, ־וף). Rhyme in couplets (AABB). Never bend the meaning or the grammar for a rhyme.",
  "4. A refrain the child can shout, identical every time (and a refrain for the other side too, if there is one).",
  "5. Repetition with a change: the same frame, a new detail each time, then one big change.",
  "6. Escalation: small, strange, absurd, peak, resolution; each step bigger and sillier than the last.",
  "7. Words as toys: invented sound words, funny comparisons, triples.",
  "8. Simple vocabulary, rich structure: few short words; the cleverness is in the pattern.",
  "9. Chaos, then order: the child enjoys the rule-breaking, but the story lands safely and warmly.",
  "10. No preaching and no moral sentence: the ending shows, the child discovers. The last page echoes the first.",
  "The illustration prompts should let the picture add a joke the text does not say, with one clear focus per page, exaggerated energetic poses, and a warm, safe mood.",
].join("\n");

/** One line for the reviewer: judge the story against the default voice too. */
export const SEUSS_REVIEW_NOTE =
  "The house style is Dr. Seuss-like rhymed Hebrew (rhythm, anticipating rhyme, a refrain, repetition with a change, escalation, no moral sentence). " +
  "A story with no rhyme or no refrain is at most `minor` on that account, never `major`.";
