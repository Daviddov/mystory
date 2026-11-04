/**
 * English names of the generation presets (src/lib/generation/presets.ts),
 * keyed by slug. Client-safe. The Hebrew labels and the prompts sent to the AI
 * stay in presets.ts; only what the studio shows changes.
 */
import type { Locale } from "./locale";

interface EnglishPreset {
  label: string;
  description: string;
}

const PRESETS_EN = {
  style: {
    watercolor: { label: "Watercolor", description: "Soft patches of color and warm light, like a hand-painted children's book" },
    "paper-cut": { label: "Paper cut-outs", description: "Layered collage of colored paper with gentle shadows" },
    "3d-animation": { label: "3D animation", description: "Round, cute characters like in an animated film" },
    "3d-clay": { label: "3D clay", description: "Clay characters with fingerprints, like stop-motion animation" },
    "3d-plush": { label: "Plush and fabric toys", description: "Soft fabric and fur toys with stitches, as if in a real playroom" },
    "3d-miniature": { label: "Miniature world", description: "A small, lit diorama, as if photographed up close on a table" },
    "3d-vinyl": { label: "Shiny vinyl toys", description: "Glossy collectible-toy characters, bold colors and soft shadows" },
    crayon: { label: "Crayons", description: "Wax-crayon drawing, colorful and cheerful like a child's" },
    "classic-storybook": { label: "Classic storybook", description: "Ink lines and rich gouache full of detail, like books of old" },
    "seuss-ink": { label: "Wild imagination (Dr. Seuss style)", description: "Wobbly ink lines, exaggerated shapes and bright colors" },
    "storybook-cartoon": {
      label: "Playful vintage cartoon",
      description: "Thick, bouncy ink lines, bright flat colors on cream paper, exaggerated characters full of energy",
    },
    "rey-gouache": { label: "Colorful adventure (Curious George style)", description: "Flat, bright gouache, simple brush line, city and blue skies" },
    "soft-pastel": { label: "Soft bedtime pastels", description: "Gentle tones and moonlight, perfect for a bedtime story" },
    "cozy-collage": { label: "Cozy collage", description: "Fabric, printed paper and simple shapes together" },
    biblical: { label: "Torah times", description: "Tents, desert and hills in golden light, wool and linen clothes" },
    sages: { label: "Times of the Sages", description: "Stone houses, a study hall and oil lamps in the Land of Israel and Babylon" },
    "modern-israel": { label: "A Jewish home in Israel today", description: "An apartment with a balcony, kindergarten, Shabbat candles and a mezuzah" },
  },
  rulePack: {
    "jewish-story": {
      label: "Jewish story",
      description: "Every man and boy with a covered head, no image of God, no symbols of other religions",
    },
    "gentle-and-safe": { label: "Gentle and safe", description: "No frightening images; hard moments are shown through feelings and consequences" },
    "character-consistency": {
      label: "Same character on every page",
      description: "Same face, age, hair, clothes and colors in every picture and every grid cell",
    },
    "dr-seuss-humour": {
      label: "Dr. Seuss style humor",
      description: "The picture adds a joke the text doesn't tell, exaggerated movement and one focus",
    },
  },
  narration: {
    "warm-storyteller": { label: "Warm storyteller", description: "A warm, natural voice at a pleasant pace, like a parent reading at bedtime" },
    "playful-rhymes": { label: "Playful rhymes", description: "A bouncy, playful rhythm that brings out the rhymes, Dr. Seuss style" },
    "calm-bedtime": { label: "Calm bedtime", description: "Slow and soft, with calm pauses that lull to sleep" },
    "excited-adventure": { label: "Exciting adventure", description: "Energetic and eager, with suspense and surprise" },
    "gentle-whisper": { label: "Close whisper", description: "A low, close voice, as if telling a secret" },
    "clear-slow-reader": { label: "Clear and slow for young readers", description: "Clear pronunciation and a slow pace, to follow the words" },
  },
  voice: {
    Sulafat: { label: "Sulafat", description: "Warm and pleasant" },
    Vindemiatrix: { label: "Vindemiatrix", description: "Gentle and soft" },
    Achernar: { label: "Achernar", description: "Soft and quiet" },
    Achird: { label: "Achird", description: "Friendly" },
    Leda: { label: "Leda", description: "Young and fresh" },
    Aoede: { label: "Aoede", description: "Light and simple" },
    Zephyr: { label: "Zephyr", description: "Bright" },
    Puck: { label: "Puck", description: "Cheerful and happy" },
    Sadachbia: { label: "Sadachbia", description: "Lively" },
    Fenrir: { label: "Fenrir", description: "Eager and excited" },
    Charon: { label: "Charon", description: "Explanatory and calm" },
    Gacrux: { label: "Gacrux", description: "Mature and confident" },
  },
  motion: {
    gentle: { label: "Gentle motion", description: "Breathing, blinking and a light sway of the characters" },
    wind: { label: "Light breeze", description: "Wind in hair, leaves, clothes and clouds" },
    "light-and-water": { label: "Light and water", description: "Sparkling water, light and stars" },
    "reacting-character": { label: "Reacting character", description: "A small expression or gesture of the main character" },
    "background-life": { label: "Life in the background", description: "Birds, butterflies and small figures in the background" },
    "slow-camera": { label: "Slow camera", description: "A very slow zoom and gentle parallax" },
  },
} satisfies Record<string, Record<string, EnglishPreset>>;

export type PresetKind = keyof typeof PRESETS_EN;

/** Label and description of a preset in the interface language; unknown slugs keep the Hebrew item. */
export function presetText<T extends { label: string; description?: string }>(
  locale: Locale,
  kind: PresetKind,
  slug: string,
  item: T,
): { label: string; description: string } {
  const hebrew = { label: item.label, description: item.description ?? "" };
  if (locale === "he") return hebrew;
  return (PRESETS_EN[kind] as Record<string, EnglishPreset>)[slug] ?? hebrew;
}

/** A preset list with labels and descriptions in the interface language (slugs and other fields unchanged). */
export function localizePresets<T extends { slug: string; label: string; description?: string }>(
  locale: Locale,
  kind: PresetKind,
  list: readonly T[],
): T[] {
  return list.map((item) => (locale === "he" ? item : { ...item, ...presetText(locale, kind, item.slug, item) }));
}
