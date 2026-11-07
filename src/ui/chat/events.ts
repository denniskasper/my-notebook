import { z } from 'zod';

/** A Citation as the UI receives it (the stored snapshot). */
export const citationViewSchema = z.object({
  sourceId: z.uuid(),
  ordinals: z.array(z.number().int().nonnegative()).min(1),
  quote: z.string(),
  sourceTitle: z.string(),
});

export type CitationView = z.infer<typeof citationViewSchema>;

/** Why asking failed, as an error code (mapped to German text in strings.ts). */
export const CHAT_ERROR_CODES = [
  'not_found',
  'invalid_question',
  'no_active_sources',
  'chat_busy',
  'llm_failed',
  'daily_allowance',
  'demo_budget_daily',
  'demo_budget_total',
  'rate_limited',
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

const part = z.number().int().nonnegative();

/**
 * The events of the Chat SSE stream. An answer is a list of text parts; each
 * Citation belongs to the part it follows. `error` before `started` means
 * nothing was stored (e.g. the Budget guard refused); after it, the answer failed.
 */
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), userMessageId: z.uuid(), assistantMessageId: z.uuid() }),
  z.object({ type: z.literal('text'), part, text: z.string() }),
  z.object({ type: z.literal('citation'), part, citation: citationViewSchema }),
  z.object({ type: z.literal('done'), status: z.enum(['complete', 'stopped']) }),
  z.object({
    type: z.literal('error'),
    error: z.enum(CHAT_ERROR_CODES),
    // When a Budget guard refusal ends, if it ends on its own.
    retryAt: z.iso.datetime().optional(),
  }),
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
