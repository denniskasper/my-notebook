'use client';

import { ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { cn } from '@/ui/cn';
import { errorMessage, format, plural, strings } from '@/ui/strings';

import { SourceKindIcon } from './kind-icon';
import type { PassageView, SourceLimits, SourceView } from './types';

type Props = {
  source: SourceView;
  passages: PassageView[];
  /** Ordinals of the Passages to highlight and scroll to (a Citation's Passages). */
  highlight: readonly number[];
  closeHref: string;
  limits: SourceLimits;
};

/** A Source read as its Passages; the margin carries each Passage's ordinal. */
export function SourceReader({ source, passages, highlight, closeHref, limits }: Props) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const highlighted = new Set(highlight);
  const highlightKey = highlight.join(',');
  const pageCount = new Set(passages.flatMap((passage) => passage.page ?? [])).size;

  useEffect(() => {
    const first = scrollArea.current?.querySelector('[data-highlighted]');
    if (!first) {
      scrollArea.current?.scrollTo({ top: 0 });
      return;
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    first.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [source.id, highlightKey]);

  return (
    <section aria-label={strings.reader.label} className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-2.5 border-b border-line-soft px-6 pt-5 pb-4">
        <SourceKindIcon kind={source.kind} size={14} className="mt-[5px] shrink-0 text-faint" />
        <div className="min-w-0 flex-1">
          <h2 className="font-read text-[19px] leading-[1.3] font-normal tracking-[-0.005em] text-text">
            {source.title}
          </h2>
          {source.url && <OriginLink url={source.url} />}
          <p className="mt-1 text-[11.5px] text-faint">
            {plural(passages.length, strings.reader.passageCount)}
            {pageCount > 0 && <> {plural(pageCount, strings.reader.pageCount)}</>}
            {source.tokenCount !== null && (
              <>, {format(strings.reader.tokenCount, { count: source.tokenCount })}</>
            )}
          </p>
        </div>
        <Link
          href={closeHref}
          aria-label={strings.reader.close}
          className="grid size-6 shrink-0 place-items-center rounded-[5px] text-muted hover:bg-hover hover:text-text"
        >
          <X size={14} aria-hidden />
        </Link>
      </header>

      <ReaderNotice source={source} limits={limits} />

      <div ref={scrollArea} className="scroll-area flex-1 pt-4 pb-16">
        <ol className="max-w-[62ch]">
          {passages.map((passage, index) => {
            const isHighlighted = highlighted.has(passage.ordinal);
            const pageStart =
              passage.page !== null && passage.page !== passages[index - 1]?.page
                ? passage.page
                : null;
            return (
              <li
                key={`${passage.ordinal}-${isHighlighted}`}
                data-ordinal={passage.ordinal}
                className="grid grid-cols-[44px_1fr] pr-6"
              >
                {pageStart !== null && <PageMarker page={pageStart} first={index === 0} />}
                {/* Ordinals count from 1 for readers; Citations store them from 0. */}
                <span
                  aria-hidden
                  className={cn(
                    'pt-[9px] pr-3 text-right text-[10.5px] text-faint tabular-nums select-none',
                    isHighlighted && 'text-hl',
                  )}
                >
                  {passage.ordinal + 1}
                </span>
                <p
                  data-highlighted={isHighlighted ? '' : undefined}
                  className={cn(
                    'scroll-my-16 rounded-r-[3px] border-l py-1.5 pr-1 pl-3 font-read text-[15.5px] leading-[1.65] whitespace-pre-line text-soft',
                    isHighlighted
                      ? 'border-hl-line bg-hl-bg text-text motion-safe:animate-[passage-highlight_1.2s_ease-out]'
                      : 'border-transparent',
                  )}
                >
                  {passage.text}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** Where a PDF page begins: the page number on a hairline, so Citations can be found in the original. */
function PageMarker({ page, first }: { page: number; first: boolean }) {
  return (
    <p
      data-page={page}
      className={cn(
        'col-start-2 flex items-center gap-2.5 pb-1.5 pl-3 text-[11px] text-faint tabular-nums',
        first ? 'pt-0' : 'pt-5',
      )}
    >
      {format(strings.reader.page, { n: page })}
      <span aria-hidden className="h-px flex-1 bg-line-soft" />
    </p>
  );
}

/** The web page a URL Source was fetched from, shown as host and path. */
function OriginLink({ url }: { url: string }) {
  const parsed = URL.parse(url);
  // Stored URLs were checked as http(s) when added; anything else is not linked.
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return null;
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  return (
    <a
      href={parsed.href}
      target="_blank"
      rel="noopener noreferrer"
      title={strings.reader.openOrigin}
      className="group/origin mt-1.5 flex max-w-full items-center gap-1.5 text-[12px] text-muted hover:text-soft focus-visible:text-soft"
    >
      <span className="truncate underline decoration-line underline-offset-[3px] group-hover/origin:decoration-muted">
        {parsed.host}
        {path}
      </span>
      <ExternalLink size={11} aria-hidden className="shrink-0" />
    </a>
  );
}

function ReaderNotice({ source, limits }: { source: SourceView; limits: SourceLimits }) {
  let text: string | null = null;
  if (source.status === 'processing') text = strings.reader.processing;
  else if (source.status === 'failed')
    text = errorMessage(source.errorCode ?? 'unknown', { cap: limits.tokenCap });
  else if (!source.enabled) text = strings.reader.disabled;
  if (!text) return null;
  return (
    <p
      role="status"
      className={cn(
        'shrink-0 border-b border-line-soft px-6 py-2.5 text-[12px] leading-snug',
        source.status === 'failed' ? 'text-danger' : 'text-muted',
      )}
    >
      {text}
    </p>
  );
}

/** The reader's state when the requested Source no longer exists. */
export function SourceReaderMissing() {
  return (
    <p className="max-w-[46ch] px-6 py-7 leading-[1.55] text-muted">{strings.reader.notFound}</p>
  );
}
