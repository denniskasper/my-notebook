'use client';

import Link from 'next/link';
import { Tooltip } from 'radix-ui';
import type { ReactNode } from 'react';

import { cn } from '@/ui/cn';
import { format, strings } from '@/ui/strings';

import type { CitationView } from './events';
import { splitTrailingWord } from './trailing-word';
import type { OpenCitation } from './types';

type Props = {
  /** The chip's number within its answer, from 1. */
  n: number;
  citation: CitationView;
  notebookId: string;
  /** False once the Source is deleted: the chip keeps its quote but opens nothing. */
  sourceExists: boolean;
  /** Its Passages are the ones the reader shows right now. */
  open: boolean;
  /** Query parameters the link keeps, e.g. the open Note. */
  preserveQuery?: Record<string, string>;
};

const CHIP =
  'mx-[2px] inline-grid h-[17px] min-w-[18px] place-items-center rounded-[4px] border px-1 align-[2px] font-ui text-[10.5px] leading-none font-semibold tabular-nums transition-colors focus-visible:outline-none';
const FILLED = 'border-hl bg-hl text-[#1a1606]';

/** An amber Citation chip; hovering or focusing it shows the cited Source and quote. */
export function CitationChip({
  n,
  citation,
  notebookId,
  sourceExists,
  open,
  preserveQuery = {},
}: Props) {
  if (!sourceExists) {
    return (
      <QuoteTooltip citation={citation} deleted>
        <span
          tabIndex={0}
          role="note"
          aria-label={format(strings.chat.citationDeleted, { n })}
          data-citation-deleted=""
          className={cn(
            CHIP,
            'cursor-default border-dashed border-hl-line/60 text-hl/55 focus-visible:border-hl',
          )}
        >
          {n}
        </span>
      </QuoteTooltip>
    );
  }

  const query = new URLSearchParams({
    ...preserveQuery,
    source: citation.sourceId,
    p: citation.ordinals.join(','),
  });
  const href = `/notebooks/${notebookId}?${query.toString().replaceAll('%2C', ',')}`;
  return (
    <QuoteTooltip citation={citation}>
      <Link
        href={href}
        scroll={false}
        aria-label={format(strings.chat.citation, { n, title: citation.sourceTitle })}
        aria-current={open ? 'true' : undefined}
        className={cn(
          CHIP,
          'border-hl-line text-hl hover:border-hl hover:bg-hl hover:text-[#1a1606] focus-visible:border-hl focus-visible:bg-hl focus-visible:text-[#1a1606]',
          open && FILLED,
        )}
      >
        {n}
      </Link>
    </QuoteTooltip>
  );
}

type TextWithChipsProps = {
  text: string;
  /** How a stretch of the text renders, e.g. with links. */
  renderText?: (text: string) => ReactNode;
  /** The Citation chips that follow the text. */
  children: ReactNode;
};

/** Text followed by Citation chips: its last word holds on to them, so a chip never starts a line alone. */
export function TextWithChips({
  text,
  renderText = (value) => value,
  children,
}: TextWithChipsProps) {
  const { lead, tail } = splitTrailingWord(text);
  return (
    <>
      {renderText(lead)}
      <span className="whitespace-nowrap">
        {renderText(tail)}
        {children}
      </span>
    </>
  );
}

/** Whether the reader shows exactly this Citation's Passages right now. */
export function isOpenCitation(
  open: OpenCitation,
  sourceId: string,
  ordinals: readonly number[],
): boolean {
  return (
    open !== null &&
    open.sourceId === sourceId &&
    open.ordinals.length === ordinals.length &&
    open.ordinals.every((ordinal, index) => ordinal === ordinals[index])
  );
}

type TooltipProps = { citation: CitationView; deleted?: boolean; children: ReactNode };

/** The cited Source, its Passages (counted from 1, as the reader shows them) and the quote. */
function QuoteTooltip({ citation, deleted = false, children }: TooltipProps) {
  const list = citation.ordinals.map((ordinal) => ordinal + 1).join(', ');
  const passages = format(
    citation.ordinals.length === 1 ? strings.chat.passages.one : strings.chat.passages.other,
    { list },
  );
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={7}
          collisionPadding={12}
          className="z-50 w-[300px] max-w-[80vw] rounded-[8px] border border-line bg-raise px-3.5 pt-2.5 pb-3 text-[11.5px] text-muted shadow-[0_6px_18px_rgb(0_0_0/0.35)] motion-safe:animate-[fade-in_120ms_ease-out]"
        >
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-medium',
                deleted ? 'text-faint line-through' : 'text-text',
              )}
            >
              {citation.sourceTitle}
            </span>
            <span className={cn('shrink-0', deleted ? 'text-hl/70' : 'text-faint')}>
              {deleted ? strings.chat.sourceDeleted : passages}
            </span>
          </span>
          <span
            className={cn(
              'mt-1.5 line-clamp-6 block border-l pl-2.5 font-read text-[13.5px] leading-[1.5]',
              deleted ? 'border-line text-muted' : 'border-hl-line text-soft',
            )}
          >
            {citation.quote}
          </span>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
