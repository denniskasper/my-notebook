'use client';

import { Plus, Type } from 'lucide-react';
import { useActionState, useState, type ComponentProps } from 'react';

import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/ui/components/dialog';
import { SubmitButton } from '@/ui/components/submit-button';
import type { ActionResult } from '@/ui/shell/notebook-header';
import { errorMessage, strings } from '@/ui/strings';

import type { SourceLimits } from './types';

type Props = {
  notebookId: string;
  limits: SourceLimits;
  addTextSource: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  /** Where the dialog is opened from: the sidebar under the Notebook, or the empty conversation. */
  placement: 'sidebar' | 'conversation';
};

const TRIGGER_CLASS = {
  sidebar:
    'flex w-full items-center gap-2 rounded-[5px] px-2 py-1 text-muted hover:bg-hover hover:text-text',
  conversation:
    'flex h-9 items-center gap-2 rounded-md border border-line px-3 text-text transition-colors hover:border-muted hover:bg-hover',
} as const;

// Radix's `asChild` hands its props (onClick, aria-*, ref) to this button.
function Trigger({
  placement,
  ...props
}: { placement: Props['placement'] } & ComponentProps<'button'>) {
  return placement === 'sidebar' ? (
    <button type="button" className={TRIGGER_CLASS.sidebar} {...props}>
      <Plus size={13} aria-hidden />
      {strings.sidebar.addSource}
    </button>
  ) : (
    <button type="button" className={TRIGGER_CLASS.conversation} {...props}>
      <Type size={14} aria-hidden className="text-muted" />
      {strings.sources.kinds.text}
    </button>
  );
}

/** Paste a text as a new Source: title plus text. */
export function AddTextSourceDialog({ placement, ...formProps }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Trigger placement={placement} />
      </DialogTrigger>
      <DialogContent>
        {/* Unmounted on close, so a reopened dialog starts empty and without an old error. */}
        <AddTextSourceForm {...formProps} onAdded={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddTextSourceForm({
  notebookId,
  limits,
  addTextSource,
  onAdded,
}: Omit<Props, 'placement'> & { onAdded: () => void }) {
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
