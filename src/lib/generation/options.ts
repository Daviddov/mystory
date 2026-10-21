/**
 * Choices offered by the AI creation wizard. Client-safe (no Node imports).
 *
 * The wizard has its own illustration style list (the product asks for these
 * five); `prompt` is the English art direction sent to the image model.
 */
import type { AgeGroup } from "../types";
import { ILLUSTRATION_STYLES } from "./presets";

/**
 * The wizard offers every style in ILLUSTRATION_STYLES (see presets.ts). The
 * five original slugs come first, in their original order; keep this list in
 * sync with presets.ts (a test checks it).
 */
const WIZARD_STYLE_SLUGS = [
  "watercolor",
  "paper-cut",
  "3d-animation",
  "crayon",
  "classic-storybook",
  "3d-clay",
  "3d-plush",
  "3d-miniature",
  "3d-vinyl",
  "seuss-ink",
  "rey-gouache",
  "soft-pastel",
  "cozy-collage",
  "biblical",
  "sages",
  "modern-israel",
] as const;

export type StoryStyle = (typeof WIZARD_STYLE_SLUGS)[number];

export const STORY_STYLES: readonly { slug: StoryStyle; label: string; emoji: string; prompt: string }[] =
  WIZARD_STYLE_SLUGS.map((slug) => {
    const style = ILLUSTRATION_STYLES.find((s) => s.slug === slug)!;
    return { slug, label: style.label, emoji: style.emoji, prompt: style.prompt };
  });

export const STORY_STYLE_SLUGS = [...WIZARD_STYLE_SLUGS] as [StoryStyle, ...StoryStyle[]];

/** The styles the daily story rotates through (the Jewish house styles are never picked at random). */
export const DAILY_STYLE_SLUGS: readonly StoryStyle[] = ["watercolor", "paper-cut", "3d-animation", "crayon", "classic-storybook"];

export function getStoryStyle(slug: string) {
  return STORY_STYLES.find((s) => s.slug === slug);
}

/**
 * The feeling a story should leave the child with. Picking one in step 2 fills
 * the idea box with a starting idea (editable) and tells the writer which tone
 * to aim for. `tone` is English guidance for the model; label and idea are shown.
 */
export const STORY_MOODS = [
  { slug: "sleep", emoji: "🌙", label: "לילה טוב", idea: "הלילה שבו הירח נעלם", tone: "A slow, soothing bedtime story: calm rhythm, soft imagery, repeated gentle phrases, and an ending where the hero feels safe and falls asleep." },
  { slug: "courage", emoji: "🦁", label: "אומץ", idea: "דרקון קטן שמפחד מאש", tone: "A story about finding inner courage: a small, gentle fear faced step by step, a warm victory, and pride at the end." },
  { slug: "confidence", emoji: "🌟", label: "ביטחון עצמי", idea: "הכוח המיוחד שהיה שם כל הזמן", tone: "A story about believing in yourself: the hero discovers a strength they already had, and others notice it kindly." },
  { slug: "new-sibling", emoji: "🍼", label: "אח או אחות חדשים", idea: "אח קטן חדש מגיע הביתה", tone: "A reassuring story about a new baby in the family: mixed feelings are named gently, and the hero keeps a special place and role." },
  { slug: "friendship", emoji: "🤝", label: "חברות", idea: "חבר חדש בגן", tone: "A story about making friends and sharing: a small misunderstanding, an apology or kind gesture, and a joyful ending together." },
  { slug: "adventure", emoji: "🚀", label: "הרפתקה", idea: "מסע לחלל בחללית מקרטון", tone: "A playful adventure full of imagination and surprises, with a safe, happy return home." },
] as const;

export type StoryMood = (typeof STORY_MOODS)[number]["slug"];
export const STORY_MOOD_SLUGS = STORY_MOODS.map((m) => m.slug) as unknown as [StoryMood, ...StoryMood[]];

export function getStoryMood(slug: string) {
  return STORY_MOODS.find((m) => m.slug === slug);
}

/** Suggestion chips for step 2. Picking one fills the idea box; it stays editable. */
export const IDEA_SUGGESTIONS: readonly string[] = [
  "מסע לחלל בחללית מקרטון",
  "היום הראשון בגן החדש",
  "גור כלבים שהלך לאיבוד",
  "הלילה שבו הירח נעלם",
  "דרקון קטן שמפחד מאש",
  "מסיבת יום הולדת מתחת למים",
  "אח קטן חדש מגיע הביתה",
  "המגפיים שקפצו לבד בשלוליות",
];

/** Suggestion chips for hobbies in step 1. */
export const HOBBY_SUGGESTIONS: readonly string[] = [
  "דינוזאורים",
  "כדורגל",
  "ציור",
  "ריקוד",
  "לגו",
  "חיות",
  "רכבות",
  "מוזיקה",
  "בישול",
  "חלל",
];

/** Writing rules per age group. The single source for prompts, the mock story and the length check. */
export interface AgeWritingRules {
  ageGroup: AgeGroup;
  pageCount: number;
  /** Target words per page. */
  wordsPerPage: number;
  /** A page above this is flagged by the deterministic length check. */
  maxWordsPerPage: number;
  /** Plain-English guidance inserted into the writer and reviewer prompts. */
  guidance: string;
}

export const AGE_WRITING_RULES: Record<AgeGroup, AgeWritingRules> = {
  "0-2": {
    ageGroup: "0-2",
    pageCount: 6,
    wordsPerPage: 10,
    maxWordsPerPage: 16,
    guidance:
      "For babies and toddlers. One or two very short sentences per page (3 to 6 words each). " +
      "Only concrete everyday words a toddler hears at home. Use a refrain that repeats on almost every page, " +
      "and sound words (animal sounds, 'בום', 'טיף טף'). No plot twists, no conflict beyond a tiny surprise, no abstract ideas.",
  },
  "3-5": {
    ageGroup: "3-5",
    pageCount: 8,
    wordsPerPage: 30,
    maxWordsPerPage: 48,
    guidance:
      "For preschoolers. Two to four short sentences per page, simple vocabulary, present or simple past tense. " +
      "A clear beginning, a small problem in the middle and a warm resolution. " +
      "A little repetition and one playful recurring phrase help the child join in.",
  },
  "6-8": {
    ageGroup: "6-8",
    pageCount: 10,
    wordsPerPage: 60,
    maxWordsPerPage: 95,
    guidance:
      "For early readers. Four to six sentences per page, richer vocabulary with an occasional new word made clear by context, " +
      "some dialogue, a real problem the hero solves by their own effort, and a satisfying ending. Humour is welcome.",
  },
};
