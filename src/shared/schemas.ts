import { z } from "zod";

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;

export const signupSchema = z
  .object({
    username: z.string().regex(USERNAME_RE, "username must be 3-24 chars of [A-Za-z0-9_.-]"),
    displayName: z.string().trim().min(1, "display name is required").max(32),
    password: z.string().min(8, "password must be at least 8 characters").max(128),
    inviteCode: z.string().min(1).max(256),
  })
  .strict();

export const loginSchema = z
  .object({
    username: z.string().min(1).max(24),
    password: z.string().min(1).max(128),
  })
  .strict();

export const videoIdSchema = z.string().refine((s) => /^[A-Za-z0-9_-]{11}$/.test(s), "invalid video id");

export const queueSchema = z
  .object({
    videoId: videoIdSchema.optional(),
    historyId: z.number().int().positive().optional(),
    url: z.string().min(1).max(2048).optional(),
  })
  .strict()
  .refine(
    (v) =>
      Number(v.videoId !== undefined) + Number(v.historyId !== undefined) + Number(v.url !== undefined) === 1,
    { message: "provide exactly one of videoId, historyId, url" },
  );

export const skipVoteSchema = z.object({ vote: z.boolean() }).strict();

export const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });

export const historyQuerySchema = z.object({
  view: z.enum(["recent", "top"]).default("recent"),
  q: z.string().trim().max(100).default(""),
  cursor: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "invalid cursor"),
  offset: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "invalid offset"),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type QueueInput = z.infer<typeof queueSchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
