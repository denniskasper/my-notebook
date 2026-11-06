'use client';

import { FileText, Globe, Plus, Type, type LucideProps } from 'lucide-react';
import { useActionState, useState } from 'react';

import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu';
import { KIND_BUTTON } from '@/ui/components/kind-button';
import { SubmitButton } from '@/ui/components/submit-button';
import type { ActionResult } from '@/ui/shell';
import { errorMessage, strings } from '@/ui/strings';

import { AddPdfSourceForm } from './add-pdf-source-form';
import { AddUrlSourceForm } from './add-url-source-form';
import type { SourceLimits } from './types';

type Props = {
  notebookId: string;
  limits: SourceLimits;
  addTextSource: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  addUrlSource: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  /** Where Sources are added from: the sidebar under the Notebook, or the empty conversation. */
  placement: 'sidebar' | 'conversation';
};

type Kind = 'text' | 'pdf' | 'url';

const KIND_ICONS = { text: Type, pdf: FileText, url: Globe } as const;

/**
 * Adds a Source: in the sidebar a menu of kinds, in the empty conversation one
 * button per kind. Each kind opens its dialog.
 */
export function AddSource({ placement, notebookId, limits, addTextSource, addUrlSource }: Props) {
  const [open, setOpen] = useState<Kind | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      {placement === 'sidebar' ? (
        // Not modal: the menu must let go of focus and pointer events for the dialog it opens.
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1 text-muted hover:bg-hover hover:text-text data-[state=open]:bg-hover data-[state=open]:text-text"
            >
              <Plus size={13} aria-hidden />
              {strings.sidebar.addSource}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {KINDS.map((kind) => (
              <DropdownMenuItem key={kind} onSelect={() => setOpen(kind)}>
                <KindIcon kind={kind} />
                {strings.sources.kinds[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        KINDS.map((kind) => (
          <button key={kind} type="button" className={KIND_BUTTON} onClick={() => setOpen(kind)}>
            <KindIcon kind={kind} size={14} className="text-muted" />
            {strings.sources.kinds[kind]}
          </button>
        ))
      )}

      <Dialog open={open !== null} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          {/* Unmounted on close, so a reopened dialog starts empty and without an old error. */}
          {open === 'text' && (
            <AddTextSourceForm
              notebookId={notebookId}
              limits={limits}
              addTextSource={addTextSource}
              onAdded={close}
            />
          )}
          {open === 'pdf' && (
            <AddPdfSourceForm notebookId={notebookId} limits={limits} onAdded={close} />
          )}
          {open === 'url' && (
            <AddUrlSourceForm
              notebookId={notebookId}
              limits={limits}
              addUrlSource={addUrlSource}
              onAdded={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const KINDS: readonly Kind[] = ['text', 'pdf', 'url'];

function KindIcon({ kind, ...props }: { kind: Kind } & LucideProps) {
  const Icon = KIND_ICONS[kind];
  return <Icon aria-hidden {...props} />;
}

function AddTextSourceForm({
  notebookId,
  limits,
  addTextSource,
  onAdded,
}: Omit<Props, 'placement' | 'addUrlSource'> & { onAdded: () => void }) {
  const [result, action] = useActionState<ActionResult, FormData>(async (previous, formData) => {
    const next = await addTextSource(previous, formData);
    if (next?.ok) onAdded();
    return next;
  }, null);
  const { addText } = strings.sources;
  const error = result?.ok === false ? result.error : null;

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pt-4 pb-3">
        <DialogTitle>{addText.title}</DialogTitle>
        <DialogDescription>{addText.description}</DialogDescription>
      </div>
      <input type="hidden" name="notebookId" value={notebookId} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">{addText.titleLabel}</span>
          <input
            name="title"
            required
            maxLength={limits.titleMax}
            placeholder={addText.titlePlaceholder}
            aria-invalid={error === 'invalid_source_title'}
            className="h-8 rounded-md border border-line bg-bg px-2.5 text-[13.5px] outline-none placeholder:text-faint focus:border-muted aria-invalid:border-danger"
          />
        </label>
        <label className="flex min-h-0 flex-1 flex-col gap-1.5">
          <span className="text-[12px] text-muted">{addText.textLabel}</span>
          {/* The reading face: what goes in here is what the reader will show. */}
          <textarea
            name="text"
            required
            maxLength={limits.textMax}
            placeholder={addText.textPlaceholder}
            aria-invalid={error === 'invalid_source_text'}
            className="h-[min(320px,45dvh)] scroll-area resize-none rounded-md border border-line bg-bg px-3 py-2.5 font-read text-[15px] leading-[1.6] text-soft outline-none placeholder:text-faint focus:border-muted aria-invalid:border-danger"
          />
        </label>
      </div>
      <div className="flex items-center gap-2 px-5 pt-3 pb-4">
        {error && (
          <p role="alert" className="mr-auto text-[12px] leading-snug text-danger">
            {errorMessage(error, {
              max: error === 'invalid_source_title' ? limits.titleMax : limits.textMax,
              cap: limits.tokenCap,
            })}
          </p>
        )}
        <DialogClose asChild>
          <Button type="button" variant="ghost" className="ml-auto">
            {addText.cancel}
          </Button>
        </DialogClose>
        <SubmitButton variant="primary">{addText.submit}</SubmitButton>
      </div>
    </form>
  );
}
