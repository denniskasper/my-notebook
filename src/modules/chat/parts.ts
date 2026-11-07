import { z } from 'zod';

import { citationSchema } from './citations';

/** A run of answer text and the Citations it relies on. Agent mode adds Step parts later. */
export const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  citations: z.array(citationSchema),
});

export const messagePartsSchema = z.array(z.discriminatedUnion('type', [textPartSchema]));

export type TextPart = z.infer<typeof textPartSchema>;
export type MessagePart = z.infer<typeof messagePartsSchema>[number];
