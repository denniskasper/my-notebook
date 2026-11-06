import type { ErrorCode } from '@/ui/strings';

import type { CitationView } from './events';

export type MessagePartView = { text: string; citations: CitationView[] };

/** What the UI shows of a Chat message; pages map module rows onto it. */
export type MessageView = {
  id: string;
  role: 'user' | 'assistant';
  status: 'streaming' | 'complete' | 'failed' | 'stopped';
  errorCode: ErrorCode | null;
  parts: MessagePartView[];
};

/** The Citation whose Passages the reader shows right now (from the URL). */
export type OpenCitation = { sourceId: string; ordinals: readonly number[] } | null;
