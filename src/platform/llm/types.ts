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

/** Everything the app asks of Claude. Later slices add Agent and Studio calls. */
export type Llm = {
  /** Input tokens `text` takes up as a user message (the free counting endpoint). */
  countTokens(text: string): Promise<number>;
  /** Streams a Chat answer grounded in `documents`; aborting `signal` ends the stream (it throws). */
  streamChat(
    request: ChatRequest,
    options: { signal: AbortSignal },
  ): AsyncIterable<ChatStreamEvent>;
};
