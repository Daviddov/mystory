/**
 * Wizard input: validation, length limits and cleaning. Client-safe, so the
 * wizard and the API share one schema.
 *
 * Every free-text field is untrusted. It is cleaned here (control characters,
 * markup characters and line breaks removed, length capped) and later placed
 * in prompts only as JSON data inside a delimited block (see prompts.ts).
 */
import { z } from "zod";
import { CATEGORY_SLUGS } from "../taxonomy";
import { AgeGroupSchema } from "../types";
import { STORY_MOOD_SLUGS, STORY_STYLE_SLUGS } from "./options";

export const INPUT_LIMITS = {
  childName: 30,
  hobby: 30,
  hobbies: 5,
  appearance: 200,
  dedication: 120,
  ideaMin: 3,
  idea: 300,
  childAgeMin: 0,
  childAgeMax: 12,
} as const;

/** The optional child photo: checked by size, declared type and file signature. */
export const PHOTO_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  contentTypes: ["image/jpeg", "image/png", "image/webp"] as const,
} as const;

/**
 * Removes control and invisible formatting characters, characters that could
 * imitate markup or prompt delimiters, and collapses all whitespace (including
 * line breaks) to single spaces.
 */
export function cleanFreeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, " ")
    .replace(/[<>{}[\]`\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function freeText(max: number) {
  return z
    .string()
    .max(max * 4) // raw cap before cleaning, so a huge payload is rejected rather than trimmed
    .transform(cleanFreeText)
    .pipe(z.string().max(max));
}

export const CHILD_GENDERS = ["boy", "girl"] as const;
export type ChildGender = (typeof CHILD_GENDERS)[number];

export const WizardInputSchema = z
  .object({
    childName: freeText(INPUT_LIMITS.childName).pipe(z.string().min(1)),
    /** Hebrew is gendered; the story needs to know how to address the hero. */
    childGender: z.enum(CHILD_GENDERS),
    childAge: z.number().int().min(INPUT_LIMITS.childAgeMin).max(INPUT_LIMITS.childAgeMax).optional(),
    hobbies: z
      .array(freeText(INPUT_LIMITS.hobby))
      .max(INPUT_LIMITS.hobbies)
      .transform((list) => Array.from(new Set(list.filter((item) => item.length > 0))))
      .default([]),
    /** How the child looks, in the parent's words. Used when no photo is given. */
    appearance: freeText(INPUT_LIMITS.appearance).default(""),
    /** A personal dedication printed at the start of the book. Shown as-is; never sent to the model. */
    dedication: freeText(INPUT_LIMITS.dedication).default(""),
    /** The feeling the story should leave the child with. Optional. */
    mood: z.enum(STORY_MOOD_SLUGS).optional(),
    idea: freeText(INPUT_LIMITS.idea).pipe(z.string().min(INPUT_LIMITS.ideaMin)),
    ageGroup: AgeGroupSchema,
    category: z.string().refine((slug) => CATEGORY_SLUGS.includes(slug), "unknown category"),
    style: z.enum(STORY_STYLE_SLUGS),
  })
  .strict();

/** Validated, cleaned wizard input. It has no photo field by construction. */
export type WizardInput = z.infer<typeof WizardInputSchema>;
/** What the browser sends (before cleaning and defaults). */
export type WizardInputDraft = z.input<typeof WizardInputSchema>;

/**
 * The only part of the input that is stored on the GenerationJob. The child's
 * name, age, hobbies, appearance and the free-text idea are deliberately left
 * out: jobs are kept for quota accounting and must not become a child profile.
 */
export function jobInputRecord(input: WizardInput, hadPhoto: boolean): Record<string, unknown> {
  return { ageGroup: input.ageGroup, category: input.category, style: input.style, hadPhoto };
}
