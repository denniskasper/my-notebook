'use client';

import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';

import type { OpenCitation } from '@/ui/chat';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { SubmitButton } from '@/ui/components/submit-button';
import type { ActionResult } from '@/ui/shell';
import { errorMessage, format, plural, strings } from '@/ui/strings';

import { NoteBody } from './note-body';
import type { NoteActions, NoteFormAction, NoteLimits, NoteView } from './types';

type Props = {
  notebookId: string;
  /** Newest change first. */
  notes: NoteView[];
  /** The Note named in the URL (`?note=`), e.g. one just saved from an answer. */
  openNoteId: string | null;
  existingSourceIds: readonly string[];
  openCitation: OpenCitation;
  limits: NoteLimits;
  actions: NoteActions;
};

type View = { kind: 'list' } | { kind: 'note'; id: string; editing: boolean } | { kind: 'new' };

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
});

/** The Notes tab: the Notebook's Notes, one opened Note, or the editor (polish tier: may be rough). */
export function NotesPanel({ notebookId, notes, openNoteId, limits, actions, ...context }: Props) {
  const [view, setView] = useState<View>(
    openNoteId ? { kind: 'note', id: openNoteId, editing: false } : { kind: 'list' },
  );
  const [shownNoteId, setShownNoteId] = useState(openNoteId);
  if (openNoteId !== shownNoteId) {
    setShownNoteId(openNoteId);
    if (openNoteId) setView({ kind: 'note', id: openNoteId, editing: false });
  }
  const sources = new Set(context.existingSourceIds);
  const showList = () => setView({ kind: 'list' });

  if (view.kind === 'new') {
    return (
      <NoteEditor
        notebookId={notebookId}
        note={null}
        limits={limits}
        save={actions.create}
        onDone={showList}
      />
    );
  }

  // A Note deleted elsewhere (or a stale `?note=`) falls back to the list.
  const note = view.kind === 'note' ? notes.find((candidate) => candidate.id === view.id) : null;
  if (view.kind === 'note' && note) {
    if (view.editing) {
      return (
        <NoteEditor
          key={note.id}
          notebookId={notebookId}
          note={note}
          limits={limits}
          save={actions.update}
          onDone={() => setView({ ...view, editing: false })}
        />
      );
    }
    return (
      <section aria-label={note.title} className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-1 border-b border-line-soft px-3 py-2">
          <Button variant="ghost" size="sm" onClick={showList}>
            <ChevronLeft size={13} aria-hidden />
            {strings.notes.back}
          </Button>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            aria-label={strings.notes.edit}
            title={strings.notes.edit}
            onClick={() => setView({ ...view, editing: true })}
          >
            <Pencil size={13} aria-hidden />
          </Button>
          <DeleteNoteButton
            notebookId={notebookId}
            note={note}
            remove={actions.remove}
            onDeleted={showList}
          />
        </header>
        <div className="scroll-area flex-1 px-6 pt-5 pb-16">
          <h2 className="font-read text-[21px] leading-[1.25] font-normal tracking-[-0.005em] text-text">
            {note.title}
          </h2>
          <p className="mt-1 mb-5 text-[11.5px] text-faint">
            {dateFormat.format(note.updatedAt)}
            {Object.keys(note.citations).length > 0 && (
              <>, {plural(Object.keys(note.citations).length, strings.notes.citationCount)}</>
            )}
          </p>
          <div className="max-w-[62ch]">
            {note.body.trim() === '' ? (
              <p className="text-[13px] text-faint">{strings.notes.emptyBody}</p>
            ) : (
              <NoteBody
                note={note}
                notebookId={notebookId}
                existingSourceIds={sources}
                openCitation={context.openCitation}
              />
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={strings.notes.list} className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center px-3 py-2">
        <Button variant="ghost" size="sm" onClick={() => setView({ kind: 'new' })}>
          <Plus size={13} aria-hidden />
          {strings.notes.new}
        </Button>
      </div>
      {notes.length === 0 ? (
        <p className="max-w-[46ch] px-6 py-5 leading-[1.55] text-muted">
          {strings.drawer.notesEmpty}
        </p>
      ) : (
        <ul className="scroll-area flex-1 border-t border-line-soft pb-10">
          {notes.map((item) => (
            <li key={item.id} className="border-b border-line-soft">
              <button
                type="button"
                onClick={() => setView({ kind: 'note', id: item.id, editing: false })}
                className="block w-full px-6 py-3 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
              >
                <span className="block truncate font-read text-[15px] text-text">{item.title}</span>
                <span className="mt-0.5 flex gap-2 text-[11.5px] text-faint">
                  <span className="min-w-0 flex-1 truncate">{excerpt(item.body)}</span>
                  <span className="shrink-0 tabular-nums">{dateFormat.format(item.updatedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The body's first words without Markdown marks or Citation markers. */
function excerpt(body: string): string {
  return body
    .replace(/\[[1-9]\d*\]/g, '')
    .replace(/[#*_`>-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

type EditorProps = {
  notebookId: string;
  /** null for a new Note. */
  note: NoteView | null;
  limits: NoteLimits;
  save: NoteFormAction;
  onDone: () => void;
};

function NoteEditor({ notebookId, note, limits, save, onDone }: EditorProps) {
  const [result, action] = useActionState<ActionResult, FormData>(async (previous, formData) => {
    const next = await save(previous, formData);
    if (next?.ok) onDone();
    return next;
  }, null);
  const error = result?.ok === false ? result.error : null;
  const errorMax = error === 'invalid_note_body' ? limits.bodyMax : limits.titleMax;

  return (
    <form action={action} className="flex h-full min-h-0 flex-col">
      <input type="hidden" name="notebookId" value={notebookId} />
      {note && <input type="hidden" name="noteId" value={note.id} />}
      <div className="flex shrink-0 flex-col gap-3 px-6 pt-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-muted">{strings.notes.titleLabel}</span>
          <input
            name="title"
            required
            maxLength={limits.titleMax}
            defaultValue={note?.title ?? strings.notes.untitled}
            placeholder={strings.notes.titlePlaceholder}
            autoFocus={note === null}
            className="h-9 rounded-md border border-line bg-bg px-2.5 font-read text-[16px] text-text outline-none focus:border-muted/60"
          />
        </label>
      </div>
      <label className="flex min-h-0 flex-1 flex-col gap-1.5 px-6 pt-3">
        <span className="text-[11.5px] text-muted">{strings.notes.bodyLabel}</span>
        <textarea
          name="body"
          maxLength={limits.bodyMax}
          defaultValue={note?.body ?? ''}
          placeholder={strings.notes.bodyPlaceholder}
          className="min-h-[220px] flex-1 resize-none rounded-md border border-line bg-bg px-3 py-2.5 text-[13.5px] leading-[1.6] text-soft outline-none placeholder:text-faint focus:border-muted/60"
        />
      </label>
      {error && (
        <p role="alert" className="px-6 pt-2 text-[12px] text-danger">
          {errorMessage(error, { max: errorMax })}
        </p>
      )}
      <div className="flex shrink-0 justify-end gap-2 px-6 pt-3 pb-5">
        <Button type="button" variant="ghost" onClick={onDone}>
          {strings.notes.cancel}
        </Button>
        <SubmitButton variant="primary">{strings.notes.save}</SubmitButton>
      </div>
    </form>
  );
}

type DeleteProps = {
  notebookId: string;
  note: NoteView;
  remove: (formData: FormData) => Promise<void>;
  onDeleted: () => void;
};

function DeleteNoteButton({ notebookId, note, remove, onDeleted }: DeleteProps) {
  return (
    <form
      action={async (formData) => {
        await remove(formData);
        onDeleted();
      }}
      onSubmit={(event) => {
        if (!window.confirm(format(strings.notes.deleteConfirm, { title: note.title }))) {
          event.preventDefault();
        }
      }}
      className="flex"
    >
      <input type="hidden" name="notebookId" value={notebookId} />
      <input type="hidden" name="noteId" value={note.id} />
      <button
        type="submit"
        aria-label={strings.notes.delete}
        title={strings.notes.delete}
        className={cn(
          'grid size-6 place-items-center rounded-[5px] text-muted transition-colors hover:bg-hover hover:text-danger',
        )}
      >
        <Trash2 size={13} aria-hidden />
      </button>
    </form>
  );
}
