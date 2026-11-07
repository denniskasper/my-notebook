type Token = { type: string };
type CitationOf<T extends Token> = Extract<T, { type: 'citation' }>;

/** A token and the Citation tokens that follow it directly. */
export type CitationRun<T extends Token> = {
  token: T;
  citations: CitationOf<T>[];
  /** Where the token sits in the inline list, for a stable React key. */
  index: number;
};

const isCitation = <T extends Token>(token: T): token is CitationOf<T> => token.type === 'citation';

/**
 * Groups inline tokens so each one carries the Citations right after it: the
 * renderer can keep those chips on one line with the text before them.
 * Citations with nothing but a Citation before them form runs of their own.
 */
export function citationRuns<T extends Token>(inline: readonly T[]): CitationRun<T>[] {
  const runs: CitationRun<T>[] = [];
  inline.forEach((token, index) => {
    const last = runs.at(-1);
    if (isCitation(token) && last && !isCitation(last.token)) last.citations.push(token);
    else runs.push({ token, citations: [], index });
  });
  return runs;
}
