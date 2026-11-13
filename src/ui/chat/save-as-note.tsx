'use client';

import { NotebookPen } from 'lucide-react';
import { useActionState } from 'react';

import type { ActionResult } from '@/ui/shell';
import { errorMessage, strings } from '@/ui/strings';

export type SaveAsNote = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

type Props = { notebookId: string; messageId: string; saveAsNote: SaveAsNote };

/** Copies the answer, Citations included, into a new Note (it opens in the Notes tab). */
export function SaveAsNoteButton({ notebookId, messageId, saveAsNote }: Props) {
  const [result, action, pending] = useActionState(saveAsNote, null);
  return (
    <form action={action} className="mt-2.5 mb-1 flex items-center gap-3 font-ui">
      <input type="hidden" name="notebookId" value={notebookId} />
      <input type="hidden" name="messageId" value={messageId} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="-ml-1.5 inline-flex h-7 items-center gap-1.5 rounded-[5px] px-1.5 text-[12px] text-muted transition-colors hover:bg-hover hover:text-text focus-visible:bg-hover focus-visible:text-text focus-visible:outline-none disabled:opacity-50"
      >
        <NotebookPen size={12} aria-hidden />
        {strings.chat.saveAsNote}
      </button>
      {result?.ok === false && (
        <span role="alert" className="text-[11.5px] text-danger">
          {errorMessage(result.error)}
        </span>
      )}
    </form>
  );
}
