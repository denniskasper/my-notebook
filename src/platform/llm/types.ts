import type { z } from 'zod';

/** A Source as Claude sees it: a titled custom-content document, one block per Passage. */
export type ChatDocument = { title: string; blocks: string[] };

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export type ChatRequest = {
  system: string;
  /** Sent ahead of the conversation, cached and with Citations enabled. */
  documents: ChatDocument[];
  /** The history, oldest first, ending with the Visitor's question. */
  turns: ChatTurn[];
};

/** Tokens one call used, as the API reports them. */
export type LlmUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** A Citations API location: blocks `[startBlockIndex, endBlockIndex)` of a document. */
export type LlmCitation = {
  documentIndex: number;
  startBlockIndex: number;
  endBlockIndex: number;
  citedText: string;
};

/**
 * What a streamed answer is made of. The answer is a run of text blocks;
 * `text` and `citation` belong to the block the last `text_block` opened.
 */
export type ChatStreamEvent =
  | { type: 'started'; usage: LlmUsage }
  | { type: 'text_block' }
  | { type: 'text'; text: string }
  | { type: 'citation'; citation: LlmCitation }
  | { type: 'finished'; usage: LlmUsage; stopReason: string | null };

/** What one Agent tool call returns to the Agent; `isError` lets it adapt instead of failing. */
export type AgentToolResult = { text: string; isError?: boolean };

/**
 * A tool the Agent may call. The handler is a plain function from the module
 * that owns it; only the adapter wraps it for its SDK (ADR 0001).
 */
export type AgentTool = {
  name: string;
  description: string;
  /** The tool's input as a Zod object shape (what the model sees as its schema). */
  input: z.ZodRawShape;
  /** Runs the tool; `input` is what the model sent, to be parsed by the handler. */
  run(input: unknown): Promise<AgentToolResult>;
};

/**
 * The gate around the built-in web search, which runs on Anthropic's side and
 * so has no handler of its own: the adapter asks before each search and
 * reports how it went.
 */
export type AgentWebSearch = {
  /** Before a search; null lets it run, a message refuses it (the Agent sees the message). */
  begin(callId: string, query: string): string | null;
  /** After a search that `begin` let run. */
  end(callId: string, ok: boolean): void;
};

export type AgentRequest = {
  system: string;
  /** The task, with the last few conversation turns as text before it. */
  prompt: string;
  tools: AgentTool[];
  /** Enables the built-in web search, behind this gate. */
  webSearch?: AgentWebSearch;
  /** Directories of local plugins whose Skills the Agent may use. */
  plugins?: string[];
  maxTurns: number;
  maxBudgetUsd: number;
};

/** Why an Agent run ended on its own (an aborted run throws instead). */
export type AgentOutcome = 'complete' | 'max_turns' | 'max_budget' | 'failed';

/**
 * What an Agent run streams. Tool calls are not events: they run the tools'
 * handlers, which see them first. `text_block` opens a new stretch of text
 * (a new turn); `usage` reports one finished model call.
 */
export type AgentStreamEvent =
  | { type: 'text_block' }
  | { type: 'text'; text: string }
  | { type: 'usage'; usage: LlmUsage }
  | { type: 'finished'; outcome: AgentOutcome; costUsd: number; usage: LlmUsage };

/** Everything the app asks of Claude. */
export type Llm = {
  /** Input tokens `text` takes up as a user message (the free counting endpoint). */
  countTokens(text: string): Promise<number>;
  /** Streams a Chat answer grounded in `documents`; aborting `signal` ends the stream (it throws). */
  streamChat(
    request: ChatRequest,
    options: { signal: AbortSignal },
  ): AsyncIterable<ChatStreamEvent>;
  /**
   * Streams a Briefing (Studio model) grounded in `documents`, in the same
   * events as a Chat answer; `turns` is the one instruction.
   */
  streamBriefing(
    request: ChatRequest,
    options: { signal: AbortSignal },
  ): AsyncIterable<ChatStreamEvent>;
  /** Runs the Agent with `tools`; aborting `signal` ends the run (it throws). */
  runAgent(
    request: AgentRequest,
    options: { signal: AbortSignal },
  ): AsyncIterable<AgentStreamEvent>;
};
