/** Everything the app asks of Claude. Later slices add Chat, Agent and Studio calls. */
export type Llm = {
  /** Input tokens `text` takes up as a user message (the free counting endpoint). */
  countTokens(text: string): Promise<number>;
};
