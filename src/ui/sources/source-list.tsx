'use client';

import { AlertCircle, RotateCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useOptimistic, useRef } from 'react';

import { cn } from '@/ui/cn';
import { SubmitButton } from '@/ui/components/submit-button';
import type { ActionResult } from '@/ui/shell';
import { errorMessage, format, strings } from '@/ui/strings';

import { SourceKindIcon } from './kind-icon';
import type { SourceLimits, SourceView } from './types';

// Text Sources finish in about a second; poll at that pace while one is processing.
const POLL_INTERVAL_MS = 1000;

export type SourceActions = {
  setEnabled: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  retry: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
};

type Props = {
  notebookId: string;
  sources: SourceView[];
  openSourceId: string | null;
  limits: SourceLimits;
  actions: SourceActions;
};

/** The open Notebook's Sources in the sidebar, with live status. */
export function SourceList({ notebookId, sources, openSourceId, limits, actions }: Props) {
  useRefreshWhile(sources.some((source) => source.status === 'processing'));
  if (sources.length === 0) return null;
  return (
    <ul>
      {sources.map((source) => (
        <SourceItem
          key={source.id}
          notebookId={notebookId}
          source={source}
          open={source.id === openSourceId}
          limits={limits}
          actions={actions}
        />
      ))}
    </ul>
  );
}

/** Re-renders the page from the server while `active`, so status changes show up live. */
function useRefreshWhile(active: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
}

type ItemProps = {
  notebookId: string;
  source: SourceView;
  open: boolean;
  limits: SourceLimits;
  actions: SourceActions;
};

function SourceItem({ notebookId, source, open, limits, actions }: ItemProps) {
  const deleteForm = useRef<HTMLFormElement>(null);
  const [enabled, setOptimisticEnabled] = useOptimistic(source.enabled);
  const [toggleResult, toggle] = useActionState<ActionResult, FormData>(
    async (previous, formData) => {
      setOptimisticEnabled(formData.get('enabled') === 'true');
      return actions.setEnabled(previous, formData);
    },
    null,
  );
  const ready = source.status === 'ready';
  const muted = !ready || !enabled;

  return (
    <li className="group/source relative">
      <div
        className={cn(
          'flex items-center gap-2 rounded-[5px] py-[3px] pr-1 pl-2 hover:bg-hover',
          open && 'bg-raise',
        )}
      >
        <SourceKindIcon
          kind={source.kind}
          size={13}
          className={cn('shrink-0', source.status === 'failed' ? 'text-danger' : 'text-faint')}
        />
        <Link
          href={`/notebooks/${notebookId}?source=${source.id}`}
          aria-current={open ? 'true' : undefined}
          className={cn(
            'min-w-0 flex-1 truncate py-0.5 transition-colors duration-300',
            muted ? 'text-muted' : 'text-text',
          )}
        >
          {source.title}
        </Link>
        <button
          type="button"
          aria-label={strings.sources.delete}
          title={strings.sources.delete}
          onClick={() => {
            if (window.confirm(format(strings.sources.deleteConfirm, { title: source.title }))) {
              deleteForm.current?.requestSubmit();
            }
          }}
          className="grid size-5 shrink-0 place-items-center rounded-[4px] text-faint opacity-0 transition-opacity group-focus-within/source:opacity-100 group-hover/source:opacity-100 hover:text-danger focus-visible:opacity-100 max-md:opacity-100"
        >
          <Trash2 size={12} aria-hidden />
        </button>
        {/* Keyed by status: each transition remounts its indicator, which fades in once. */}
        <span
          key={source.status}
          className="flex shrink-0 motion-safe:animate-[fade-in_250ms_ease-out]"
        >
          {source.status === 'processing' && <ProcessingDot />}
          {source.status === 'ready' && (
            <EnabledSwitch
              notebookId={notebookId}
              sourceId={source.id}
              enabled={enabled}
              toggle={toggle}
            />
          )}
          {source.status === 'failed' && (
            <AlertCircle size={13} aria-hidden className="text-danger" />
          )}
        </span>
      </div>

      {source.status === 'processing' && (
        <p role="status" className="relative mb-1 ml-[29px] text-[11.5px] text-faint">
          {strings.sources.processing}
          <span
            aria-hidden
            className="absolute -bottom-0.5 left-0 h-px w-16 origin-left bg-muted motion-safe:animate-[processing-pulse_1.6s_ease-in-out_infinite]"
          />
        </p>
      )}
      {source.status === 'failed' && (
        <div
          role="status"
          className="mb-1.5 ml-[29px] pr-2 motion-safe:animate-[fade-in_250ms_ease-out]"
        >
          <p className="text-[11.5px] leading-snug text-danger">
            {errorMessage(source.errorCode ?? 'unknown', { cap: limits.tokenCap })}
          </p>
          <form action={actions.retry} className="mt-1">
            <input type="hidden" name="notebookId" value={notebookId} />
            <input type="hidden" name="sourceId" value={source.id} />
            <SubmitButton variant="ghost" size="sm" className="-ml-2 gap-1 text-[11.5px]">
              <RotateCw size={11} aria-hidden />
              {strings.sources.retry}
            </SubmitButton>
          </form>
        </div>
      )}

      {toggleResult?.ok === false && (
        <p role="alert" className="mb-1.5 ml-[29px] pr-2 text-[11.5px] leading-snug text-danger">
          {errorMessage(toggleResult.error, { cap: limits.tokenCap })}
        </p>
      )}

      <form ref={deleteForm} action={actions.remove} hidden>
        <input type="hidden" name="notebookId" value={notebookId} />
        <input type="hidden" name="sourceId" value={source.id} />
      </form>
    </li>
  );
}

function ProcessingDot() {
  return (
    <span className="grid size-[26px] place-items-center" aria-hidden>
      <span className="size-1.5 rounded-full bg-muted motion-safe:animate-pulse" />
    </span>
  );
}

type SwitchProps = {
  notebookId: string;
  sourceId: string;
  enabled: boolean;
  toggle: (formData: FormData) => void;
};

/** On/off for answers; turning on can be refused by the token cap. */
function EnabledSwitch({ notebookId, sourceId, enabled, toggle }: SwitchProps) {
  return (
    <form action={toggle} className="flex">
      <input type="hidden" name="notebookId" value={notebookId} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <button
        type="submit"
        role="switch"
        aria-checked={enabled}
        aria-label={strings.sources.enabledLabel}
        title={strings.sources.enabledLabel}
        className="grid h-5 w-[26px] place-items-center rounded-[4px]"
      >
        <span
          className={cn(
            'relative h-3 w-[22px] rounded-full border transition-colors',
            enabled ? 'border-soft bg-soft' : 'border-line bg-transparent',
          )}
        >
          <span
            className={cn(
              'absolute top-1/2 size-2 -translate-y-1/2 rounded-full transition-[left,background-color] duration-150',
              enabled ? 'left-[11px] bg-bg' : 'left-[1px] bg-faint',
            )}
          />
        </span>
      </button>
    </form>
  );
}
