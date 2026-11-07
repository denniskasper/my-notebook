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
  'invalid_task',
  'agent_busy',
  'daily_allowance',
  'demo_budget_daily',
  'demo_budget_total',
  'rate_limited',
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

const part = z.number().int().nonnegative();

/** One Step of an Agent run, as the timeline shows it. */
export const stepViewSchema = z.object({
  type: z.literal('step'),
  id: z.string(),
  tool: z.string(),
  argument: z.string().nullable(),
  status: z.enum(['running', 'done', 'failed']),
});

export type StepView = z.infer<typeof stepViewSchema>;

/** The caps that end an Agent run like Stop. */
export const AGENT_STOP_REASONS = ['agent_max_turns', 'agent_max_budget', 'agent_timeout'] as const;

/**
 * The events of the Chat and Agent SSE streams. An answer is a list of parts:
 * text, each Citation belonging to the text part it follows, and (Agent) Steps,
 * which a later `step` event for the same part replaces. `error` before
 * `started` means nothing was stored (e.g. the Budget guard refused); after it,
 * the answer failed.
 */
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), userMessageId: z.uuid(), assistantMessageId: z.uuid() }),
  z.object({ type: z.literal('text'), part, text: z.string() }),
  z.object({ type: z.literal('citation'), part, citation: citationViewSchema }),
  z.object({ type: z.literal('step'), part, step: stepViewSchema }),
  // The Agent wrote a Note: the page reloads so it shows up.
  z.object({ type: z.literal('note_created'), noteId: z.uuid() }),
  // The Agent added a web page as a Source: the page reloads so the sidebar shows it.
  z.object({ type: z.literal('source_added'), sourceId: z.uuid() }),
  z.object({
    type: z.literal('done'),
    status: z.enum(['complete', 'stopped']),
    // Which cap ended an Agent run, if one did.
    reason: z.enum(AGENT_STOP_REASONS).optional(),
    // What an Agent run was charged, in micro-dollars.
    costMicroUsd: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.enum(CHAT_ERROR_CODES),
    // When a Budget guard refusal ends, if it ends on its own.
    retryAt: z.iso.datetime().optional(),
  }),
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
