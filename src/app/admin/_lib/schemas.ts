/** Request body schemas of the admin API. Client-safe. */
import { z } from "zod";
import { BookStatusSchema, IdSchema, SlugSchema, UserRoleSchema } from "@/lib/types";

export const REVIEW_NOTE_MAX = 1000;

export const ReviewInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    /**
     * The `updatedAt` of the book the editor read. When given, the approval is
     * refused if the book changed since, so only what was read gets published.
     */
    updatedAt: z.string().min(1).max(64).optional(),
    /** Publish although credits are missing. Honoured for admins only. */
    waiveCredits: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("reject"),
    /** Shown to the book owner; required so they know what to fix. */
    note: z.string().trim().min(3).max(REVIEW_NOTE_MAX),
  }),
]);
export type ReviewInput = z.infer<typeof ReviewInputSchema>;

export const BookStatusInputSchema = z.object({
  status: BookStatusSchema,
  /** Publish although credits are missing. Honoured for admins only. */
  waiveCredits: z.boolean().optional(),
});
export type BookStatusInput = z.infer<typeof BookStatusInputSchema>;

/** Season keys look like slugs ("winter", "rosh-hashana"). */
export const SeasonKeySchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid season key");

const BookIdsSchema = z
  .array(IdSchema)
  .max(200)
  .refine((ids) => new Set(ids).size === ids.length, "duplicate book ids");

export const CollectionCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  /** Omit to derive the slug from the title. */
  slug: SlugSchema.optional(),
  /** null or omitted = no season. */
  season: SeasonKeySchema.nullish(),
  bookIds: BookIdsSchema.default([]),
});
export type CollectionCreateInput = z.infer<typeof CollectionCreateSchema>;

export const CollectionUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000),
    slug: SlugSchema,
    /** null removes the season. */
    season: SeasonKeySchema.nullable(),
    bookIds: BookIdsSchema,
  })
  .partial();
export type CollectionUpdateInput = z.infer<typeof CollectionUpdateSchema>;

export const SettingsInputSchema = z.object({
  /** null clears the book of the week. */
  bookOfTheWeekId: IdSchema.nullable(),
});
export type SettingsInput = z.infer<typeof SettingsInputSchema>;

export const UserRoleInputSchema = z.object({ role: UserRoleSchema });
export type UserRoleInput = z.infer<typeof UserRoleInputSchema>;
