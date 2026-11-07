'use client';

import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, type DragEvent } from 'react';

import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { DialogClose, DialogDescription, DialogTitle } from '@/ui/components/dialog';
import { errorMessage, format, strings, type ErrorCode } from '@/ui/strings';

import type { SourceLimits } from './types';
import { pdfUploadResponseSchema } from './upload';

type Props = { notebookId: string; limits: SourceLimits; onAdded: () => void };

type State =
  { kind: 'idle' } | { kind: 'reading'; name: string } | { kind: 'failed'; error: ErrorCode };

const BYTES_PER_MB = 1024 * 1024;

/** Picks or drops a PDF and uploads it at once; the text is read on the server. */
export function AddPdfSourceForm({ notebookId, limits, onAdded }: Props) {
  const router = useRouter();
  const inputId = useId();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const { addPdf } = strings.sources;
  const maxMb = Math.round(limits.pdfMaxBytes / BYTES_PER_MB);
  const reading = state.kind === 'reading';

  async function upload(file: File | undefined) {
    if (!file || reading) return;
    if (file.size > limits.pdfMaxBytes) {
      setState({ kind: 'failed', error: 'pdf_too_large' });
      return;
    }
    setState({ kind: 'reading', name: file.name });
    const body = new FormData();
    body.set('file', file);
    const error = await send(notebookId, body);
    if (error) {
      setState({ kind: 'failed', error });
      return;
    }
    router.refresh();
    onAdded();
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col">
      <div className="px-5 pt-4 pb-3">
        <DialogTitle>{addPdf.title}</DialogTitle>
        <DialogDescription>{addPdf.description}</DialogDescription>
      </div>
      <div className="px-5">
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          aria-busy={reading}
          className={cn(
            'relative flex h-[168px] cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md border border-dashed bg-bg px-6 text-center transition-colors focus-within:border-muted',
            dragging ? 'border-soft bg-hover' : 'border-line hover:border-muted',
            reading && 'cursor-progress',
          )}
        >
          <FileText
            size={20}
            aria-hidden
            className={cn('mb-1 transition-colors', dragging ? 'text-text' : 'text-faint')}
          />
          {reading ? (
            <p role="status" className="max-w-full truncate text-[13px] text-soft">
              {format(addPdf.reading, { name: state.name })}
            </p>
          ) : (
            <>
              <span className="text-[13.5px] text-text">{addPdf.drop}</span>
              <span className="text-[12.5px] text-muted underline decoration-line underline-offset-[3px]">
                {addPdf.choose}
              </span>
            </>
          )}
          {reading && (
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-px origin-left bg-muted motion-safe:animate-[processing-pulse_1.6s_ease-in-out_infinite]"
            />
          )}
          <input
            id={inputId}
            type="file"
            accept="application/pdf,.pdf"
            aria-label={addPdf.fileLabel}
            disabled={reading}
            className="sr-only"
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        <p className="mt-2 text-[11.5px] leading-snug text-faint">
          {format(addPdf.hint, { max: maxMb })}
        </p>
      </div>
      <div className="flex items-center gap-2 px-5 pt-3 pb-4">
        {state.kind === 'failed' && (
          <p role="alert" className="mr-auto text-[12px] leading-snug text-danger">
            {errorMessage(state.error, { max: maxMb, cap: limits.tokenCap })}
          </p>
        )}
        <DialogClose asChild>
          <Button type="button" variant="ghost" className="ml-auto">
            {addPdf.cancel}
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}

/** Uploads the form; null on success, otherwise the error code to show. */
async function send(notebookId: string, body: FormData): Promise<ErrorCode | null> {
  try {
    const response = await fetch(`/api/notebooks/${notebookId}/sources/pdf`, {
      method: 'POST',
      body,
    });
    const reply = pdfUploadResponseSchema.safeParse(await response.json());
    if (!reply.success) return 'unknown';
    return reply.data.ok ? null : reply.data.error;
  } catch {
    return 'unknown';
  }
}
