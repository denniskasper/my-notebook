'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useActionState, useRef, useState } from 'react';

import { Button } from '@/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu';
import { errorMessage, format, strings, type ErrorCode } from '@/ui/strings';

type RenameResult = { ok: true } | { ok: false; error: ErrorCode } | null;

type Props = {
  notebook: { id: string; title: string };
  maxTitleLength: number;
  renameNotebook: (previous: RenameResult, formData: FormData) => Promise<RenameResult>;
  deleteNotebook: (formData: FormData) => Promise<void>;
};

/** Notebook title with rename and delete (polish tier: may be rough). */
export function NotebookHeader({
  notebook,
  maxTitleLength,
  renameNotebook,
  deleteNotebook,
}: Props) {
  const [editing, setEditing] = useState(false);
  const deleteForm = useRef<HTMLFormElement>(null);
  const [result, renameAction, pending] = useActionState<RenameResult, FormData>(
    async (previous, formData) => {
      const next = await renameNotebook(previous, formData);
      if (next?.ok) setEditing(false);
      return next;
    },
    null,
  );

  return (
    <>
      {editing ? (
        <form action={renameAction} className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="notebookId" value={notebook.id} />
          <input
            name="title"
            aria-label={strings.notebook.renameLabel}
            defaultValue={notebook.title}
            maxLength={maxTitleLength}
            required
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false);
            }}
            aria-invalid={result?.ok === false}
            className="h-7 max-w-[420px] min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-[14px] font-semibold outline-none focus:border-muted"
          />
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {strings.notebook.renameSave}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => setEditing(false)}>
            {strings.notebook.renameCancel}
          </Button>
          {result?.ok === false && (
            <p role="alert" className="truncate text-[12px] text-danger">
              {errorMessage(result.error)}
            </p>
          )}
        </form>
      ) : (
        <>
          <h1 className="truncate text-[14px] font-semibold">{notebook.title}</h1>
          <span className="shrink-0 text-faint max-sm:hidden">{strings.notebook.noSources}</span>
          <span className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={strings.notebook.actions}>
                <MoreHorizontal size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil aria-hidden />
                {strings.notebook.rename}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger [&_svg]:text-danger"
                onSelect={() => {
                  if (
                    window.confirm(
                      format(strings.notebook.deleteConfirm, { title: notebook.title }),
                    )
                  ) {
                    deleteForm.current?.requestSubmit();
                  }
                }}
              >
                <Trash2 aria-hidden />
                {strings.notebook.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <form ref={deleteForm} action={deleteNotebook} hidden>
        <input type="hidden" name="notebookId" value={notebook.id} />
      </form>
    </>
  );
}
