/**
 * Choices offered by the AI creation wizard. Client-safe (no Node imports).
 *
 * The wizard has its own illustration style list (the product asks for these
 * five); `prompt` is the English art direction sent to the image model.
 */
import type { AgeGroup } from "../types";
import { ILLUSTRATION_STYLES } from "./presets";

/**
 * The wizard offers only the five original general styles; the Jewish house
 * styles and the newer general ones are chosen in the studio (they live in
 * ILLUSTRATION_STYLES, see presets.ts). Slugs and shape are unchanged.
 */
const WIZARD_STYLE_SLUGS = ["watercolor", "paper-cut", "3d-animation", "crayon", "classic-storybook"] as const;

export type StoryStyle = (typeof WIZARD_STYLE_SLUGS)[number];

export const STORY_STYLES: readonly { slug: StoryStyle; label: string; emoji: string; prompt: string }[] =
  WIZARD_STYLE_SLUGS.map((slug) => {
    const style = ILLUSTRATION_STYLES.find((s) => s.slug === slug)!;
    return { slug, label: style.label, emoji: style.emoji, prompt: style.prompt };
  });

export const STORY_STYLE_SLUGS = [...WIZARD_STYLE_SLUGS] as [StoryStyle, ...StoryStyle[]];

export function getStoryStyle(slug: string) {
  return STORY_STYLES.find((s) => s.slug === slug);
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
