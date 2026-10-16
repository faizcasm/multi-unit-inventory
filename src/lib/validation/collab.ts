import { z } from 'zod'

/** A single transfer discussion comment — 1–2000 characters, trimmed. */
export const commentBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(2000, 'Comment must be 2000 characters or less'),
})

export type CommentBodyInput = z.infer<typeof commentBodySchema>
