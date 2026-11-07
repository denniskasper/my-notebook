'use client';

import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';

import type { ComposerBlock, OpenCitation } from '@/ui/chat';
import { SubmitButton } from '@/ui/components/submit-button';
import { errorMessage, format, retryValues, strings } from '@/ui/strings';

import { BriefingBody } from './briefing-body';
import type { BriefingView, GenerateBriefing, StudioActionResult } from './types';

type Props = {
  notebookId: string;
  /** Newest first. */
  briefings: BriefingView[];
  /** Enabled ready Sources; a Briefing needs at least one. */
  activeSourceCount: number;
  existingSourceIds: readonly string[];
  openCitation: OpenCitation;
  /** A spend cap that already stops every call (rate limits show only after a click). */
  blocked: ComposerBlock | null;
  generateBriefing: GenerateBriefing;
};

const POLL_INTERVAL_MS = 1_000;

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
});

/** The Studio tab: generate a Briefing, and the Notebook's Briefings, newest first (polish tier: may be rough). */
export function StudioPanel({
  notebookId,
  briefings,
  activeSourceCount,
  existingSourceIds,
  openCitation,
  blocked,
  generateBriefing,
}: Props) {
  const [result, action] = useActionState<StudioActionResult, FormData>(generateBriefing, null);
  const processing = briefings.some((briefing) => briefing.status === 'processing');
  useRefreshWhile(processing);
  const sources = new Set(existingSourceIds);
  const canGenerate = activeSourceCount > 0 && !processing && blocked === null;
  const refusal = result?.ok === false ? result : null;
  const shownError = refusal ?? (blocked && { error: blocked.code, retryAt: blocked.retryAt });

  return (
    <section aria-label={strings.studio.label} className="flex h-full min-h-0 flex-col">
      <form action={action} className="shrink-0 border-b border-line-soft px-6 pt-5 pb-4">
        <input type="hidden" name="notebookId" value={notebookId} />
        <p className="max-w-[46ch] text-[12.5px] leading-[1.55] text-muted">
          {activeSourceCount > 0 ? strings.studio.intro : strings.studio.noActiveSources}
        </p>
        <SubmitButton variant="primary" size="lg" className="mt-3" disabled={!canGenerate}>
          <FileText size={14} aria-hidden />
          {strings.studio.generate}
        </SubmitButton>
        {shownError && (
          <p role="alert" className="mt-2 text-[12px] text-danger">
            {errorMessage(
              shownError.error,
              shownError.retryAt ? retryValues(shownError.retryAt, new Date()) : {},
            )}
          </p>
        )}
      </form>
      <ol className="scroll-area flex-1 pb-16">
        {briefings.map((briefing, index) => (
          <li key={briefing.id} className="border-b border-line-soft">
            <Briefing
              briefing={briefing}
              defaultOpen={index === 0}
              notebookId={notebookId}
              existingSourceIds={sources}
              openCitation={openCitation}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

type BriefingProps = {
  briefing: BriefingView;
  defaultOpen: boolean;
  notebookId: string;
  existingSourceIds: ReadonlySet<string>;
  openCitation: OpenCitation;
};

/** One Briefing; older ones start folded so the newest reads first. */
function Briefing({ briefing, defaultOpen, ...context }: BriefingProps) {
  const title = format(strings.studio.briefing, { date: dateFormat.format(briefing.createdAt) });
  return (
    <article
      aria-label={title}
      data-status={briefing.status}
      aria-busy={briefing.status === 'processing' || undefined}
    >
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 px-6 py-3 transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <h3 className="min-w-0 flex-1 truncate font-read text-[15px] text-text">{title}</h3>
          <StatusLabel briefing={briefing} />
        </summary>
        {briefing.status !== 'processing' && (
          <div className="max-w-[62ch] px-6 pt-1 pb-5">
            <BriefingContent briefing={briefing} {...context} />
          </div>
        )}
      </details>
    </article>
  );
}

function StatusLabel({ briefing }: { briefing: BriefingView }) {
  if (briefing.status === 'processing') {
    return (
      <span role="status" className="shrink-0 text-[11.5px] text-muted motion-safe:animate-pulse">
        {strings.studio.generating}
      </span>
    );
  }
  return null;
}

function BriefingContent({ briefing, ...context }: Omit<BriefingProps, 'defaultOpen'>) {
  if (briefing.status === 'failed') {
    const code = briefing.errorCode;
    return (
      <p role="alert" className="text-[12px] text-danger">
        {code === null || code === 'llm_failed' || code === 'unknown'
          ? strings.studio.failed
          : errorMessage(code)}
      </p>
    );
  }
  if (briefing.content.every((part) => part.text.trim() === '')) {
    return <p className="text-[12.5px] text-faint">{strings.studio.empty}</p>;
  }
  return <BriefingBody briefing={briefing} {...context} />;
}

/** Re-renders the page from the server while a Briefing is processing, so it shows up when done. */
function useRefreshWhile(active: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
}
