import Anthropic from '@anthropic-ai/sdk';

import { runAgentWithSdk } from './agent-sdk';
import { MODELS } from './models';
import type { ChatRequest, ChatStreamEvent, Llm, LlmUsage } from './types';

/** How a call is made: which model, how long its output may get, how hard it thinks. */
type CallProfile = { model: string; maxTokens: number; effort: 'low' | 'medium' };

// Chat wants fast, grounded answers, not long deliberation; answers are meant to be short.
const CHAT: CallProfile = { model: MODELS.chat, maxTokens: 4_096, effort: 'low' };
// A Briefing weighs every Source once, so it gets the Studio model and some room to think.
const BRIEFING: CallProfile = { model: MODELS.studio, maxTokens: 8_192, effort: 'medium' };

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
      return streamAnswer(client, request, CHAT, signal);
    },
    streamBriefing(request, { signal }) {
      return streamAnswer(client, request, BRIEFING, signal);
    },
    runAgent(request, { signal }) {
      return runAgentWithSdk(apiKey, request, { signal });
    },
  };
}

/**
 * The Sources go first, as custom-content documents with Citations enabled and
 * a cache breakpoint after the last one (ADR 0002): the system prompt and the
 * documents form a prefix that stays the same across a Notebook's questions.
 */
export function toMessageParams(
  request: ChatRequest,
  profile: CallProfile,
): Anthropic.MessageCreateParamsStreaming {
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
    throw new Error('A request must start with a user turn');
  }

  return {
    model: profile.model,
    max_tokens: profile.maxTokens,
    stream: true,
    system: request.system,
    output_config: { effort: profile.effort },
    // Also caches the conversation so far for the next question.
    cache_control: { type: 'ephemeral' },
    messages: [{ role: 'user', content: [...documents, ...first.content] }, ...rest],
  };
}

function toUsage(
  model: string,
  usage: {
    input_tokens: number | null;
    output_tokens: number;
    cache_read_input_tokens: number | null;
    cache_creation_input_tokens: number | null;
  },
): LlmUsage {
  return {
    model,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

async function* streamAnswer(
  client: Anthropic,
  request: ChatRequest,
  profile: CallProfile,
  signal: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const stream = client.messages.stream(toMessageParams(request, profile), { signal });
  for await (const event of stream) {
    switch (event.type) {
      case 'message_start':
        yield { type: 'started', usage: toUsage(profile.model, event.message.usage) };
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
  yield {
    type: 'finished',
    usage: toUsage(profile.model, message.usage),
    stopReason: message.stop_reason,
  };
}
