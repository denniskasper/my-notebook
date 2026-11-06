import Anthropic from '@anthropic-ai/sdk';

import { MODELS } from './models';
import type { ChatRequest, ChatStreamEvent, Llm, LlmUsage } from './types';

// Enough for a thorough answer; Chat answers are meant to be short.
const CHAT_MAX_TOKENS = 4_096;

/** The Client SDK adapter (ADR 0001). */
export function createRealLlm(apiKey: string): Llm {
  const client = new Anthropic({ apiKey });
  return {
    async countTokens(text) {
      // Counted against the Chat model, which is where Sources are sent.
      const result = await client.messages.countTokens({
        model: MODELS.chat,
        messages: [{ role: 'user', content: text }],
      });
      return result.input_tokens;
    },
    streamChat(request, { signal }) {
      return streamChat(client, request, signal);
    },
  };
}

/**
 * The Sources go first, as custom-content documents with Citations enabled and
 * a cache breakpoint after the last one (ADR 0002): the system prompt and the
 * documents form a prefix that stays the same across a Notebook's questions.
 */
export function toMessageParams(request: ChatRequest): Anthropic.MessageCreateParamsStreaming {
  const documents: Anthropic.DocumentBlockParam[] = request.documents.map((document, index) => ({
    type: 'document',
    title: document.title,
    source: {
      type: 'content',
      content: document.blocks.map((text) => ({ type: 'text', text })),
    },
    citations: { enabled: true },
    ...(index === request.documents.length - 1 && { cache_control: { type: 'ephemeral' } }),
  }));

  const messages: Anthropic.MessageParam[] = request.turns.map((turn) => ({
    role: turn.role,
    content: [{ type: 'text', text: turn.text }],
  }));
  const [first, ...rest] = messages;
  if (!first || first.role !== 'user' || typeof first.content === 'string') {
    throw new Error('A Chat request must start with a user turn');
  }

  return {
    model: MODELS.chat,
    max_tokens: CHAT_MAX_TOKENS,
    stream: true,
    system: request.system,
    // Chat wants fast, grounded answers, not long deliberation.
    output_config: { effort: 'low' },
    // Also caches the conversation so far for the next question.
    cache_control: { type: 'ephemeral' },
    messages: [{ role: 'user', content: [...documents, ...first.content] }, ...rest],
  };
}

function toUsage(usage: {
  input_tokens: number | null;
  output_tokens: number;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
}): LlmUsage {
  return {
    model: MODELS.chat,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

async function* streamChat(
  client: Anthropic,
  request: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const stream = client.messages.stream(toMessageParams(request), { signal });
  for await (const event of stream) {
    switch (event.type) {
      case 'message_start':
        yield { type: 'started', usage: toUsage(event.message.usage) };
        break;
      case 'content_block_start':
        // Thinking blocks are not part of the answer.
        if (event.content_block.type === 'text') yield { type: 'text_block' };
        break;
      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        } else if (
          event.delta.type === 'citations_delta' &&
          event.delta.citation.type === 'content_block_location'
        ) {
          const { citation } = event.delta;
          yield {
            type: 'citation',
            citation: {
              documentIndex: citation.document_index,
              startBlockIndex: citation.start_block_index,
              endBlockIndex: citation.end_block_index,
              citedText: citation.cited_text,
            },
          };
        }
        break;
    }
  }
  const message = await stream.finalMessage();
  yield { type: 'finished', usage: toUsage(message.usage), stopReason: message.stop_reason };
}
