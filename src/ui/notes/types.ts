import type { CitationView } from '@/ui/chat';
import type { ActionResult } from '@/ui/shell';

/** What the UI shows of a Note; pages map module rows onto it. */
export type NoteView = {
  id: string;
  title: string;
  /** Markdown with `[n]` markers. */
  body: string;
  /** Marker number → Citation snapshot. */
  citations: Record<string, CitationView>;
  updatedAt: Date;
};

export type NoteLimits = { titleMax: number; bodyMax: number };

export type NoteFormAction = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

export type NoteActions = {
  create: NoteFormAction;
  update: NoteFormAction;
  remove: (formData: FormData) => Promise<void>;
};
