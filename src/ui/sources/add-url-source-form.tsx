'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/ui/components/button';
import { DialogClose, DialogDescription, DialogTitle } from '@/ui/components/dialog';
import { SubmitButton } from '@/ui/components/submit-button';
import type { ActionResult } from '@/ui/shell';
import { errorMessage, strings } from '@/ui/strings';

import type { SourceLimits } from './types';

type Props = {
  notebookId: string;
  limits: SourceLimits;
  addUrlSource: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  onAdded: () => void;
};

/** Adds a web page as a new Source by its address; the page is fetched while processing. */
export function AddUrlSourceForm({
  notebookId,
  limits,
  addUrlSource,
  onAdded,
}: Props) {
  const [result, action] = useActionState<ActionResult, FormData>(async (previous, formData) => {
    const next = await addUrlSource(previous, formData);
    if (next?.ok) onAdded();
    return next;
  }, null);
  // Controlled, so a refused address stays in the field to be corrected (React resets forms after an action).
  const [url, setUrl] = useState('');
  const { addUrl } = strings.sources;
  const error = result?.ok === false ? result.error : null;

  return (
    <form action={action} className="flex flex-col">
      <div className="px-5 pt-4 pb-3">
        <DialogTitle>{addUrl.title}</DialogTitle>
        <DialogDescription>{addUrl.description}</DialogDescription>
      </div>
      <input type="hidden" name="notebookId" value={notebookId} />
      <label className="flex flex-col gap-1.5 px-5">
        <span className="text-[12px] text-muted">{addUrl.urlLabel}</span>
        {/* type=text, not url: the server decides what counts, and says why in German. */}
        <input
          name="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          required
          autoFocus
          maxLength={limits.urlMax}
          placeholder={addUrl.urlPlaceholder}
          aria-invalid={error !== null}
          aria-describedby={error ? 'add-url-error' : undefined}
          className="h-9 rounded-md border border-line bg-bg px-2.5 text-[13.5px] outline-none placeholder:text-faint focus:border-muted aria-invalid:border-danger"
        />
      </label>
      <div className="flex items-center gap-2 px-5 pt-3 pb-4">
        {error && (
          <p
            id="add-url-error"
            role="alert"
            className="mr-auto text-[12px] leading-snug text-danger"
          >
            {errorMessage(error)}
          </p>
        )}
        <DialogClose asChild>
          <Button type="button" variant="ghost" className="ml-auto">
            {addUrl.cancel}
          </Button>
        </DialogClose>
        <SubmitButton variant="primary">{addUrl.submit}</SubmitButton>
      </div>
    </form>
  );
}
