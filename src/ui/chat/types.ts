import type { ErrorCode } from '@/ui/strings';

import type { CitationView, StepView } from './events';

export type TextPartView = { type: 'text'; text: string; citations: CitationView[] };

/** A run of text with its Citations, or (Agent) one Step. */
export type MessagePartView = TextPartView | StepView;

/** What the UI shows of a Chat message; pages map module rows onto it. */
export type MessageView = {
  id: string;
  role: 'user' | 'assistant';
  mode: 'chat' | 'agent';
  status: 'streaming' | 'complete' | 'failed' | 'stopped';
  errorCode: ErrorCode | null;
  parts: MessagePartView[];
  /** What an Agent run was charged, in micro-dollars; null while it runs or if unknown. */
  costMicroUsd: number | null;
  /** False while the answer exists only in the browser (it can't be saved as a Note yet). */
  stored: boolean;
};

/** The Citation whose Passages the reader shows right now (from the URL). */
export type OpenCitation = { sourceId: string; ordinals: readonly number[] } | null;
