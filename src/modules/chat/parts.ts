import { z } from 'zod';

import { citationSchema } from './citations';

/** A run of answer text and the Citations it relies on. */
export const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  citations: z.array(citationSchema),
});

/**
 * One Step of an Agent run: the tool, its key argument (a Source or Note title)
 * and how it went. Kept in the message so the timeline replays after a reload.
 */
export const stepPartSchema = z.object({
  type: z.literal('step'),
  id: z.string(),
  tool: z.string(),
  argument: z.string().nullable(),
  status: z.enum(['running', 'done', 'failed']),
});

export const messagePartsSchema = z.array(
  z.discriminatedUnion('type', [textPartSchema, stepPartSchema]),
);

export type TextPart = z.infer<typeof textPartSchema>;
export type StepPart = z.infer<typeof stepPartSchema>;
export type MessagePart = z.infer<typeof messagePartsSchema>[number];

/** A message's text without its Steps. */
export function messageText(parts: readonly MessagePart[]): string {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}
