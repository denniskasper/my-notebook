import { Tooltip } from 'radix-ui';
import { Fragment } from 'react';

import { CitationChip, isOpenCitation, type OpenCitation } from '@/ui/chat';
import { cn } from '@/ui/cn';

import { briefingBlocks, type Inline } from './blocks';
import type { BriefingView } from './types';

type Context = {
  notebookId: string;
  existingSourceIds: ReadonlySet<string>;
  openCitation: OpenCitation;
};

/** A Briefing set like an answer: quiet headings, key points as a list, amber Citation chips. */
export function BriefingBody({ briefing, ...context }: { briefing: BriefingView } & Context) {
  const blocks = briefingBlocks(briefing.content);
  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <div className="flex flex-col gap-2.5 font-read text-[15px] leading-[1.65] text-soft">
        {blocks.map((block, index) => {
          switch (block.type) {
            case 'heading':
              return (
                <h4
                  key={index}
                  className={cn(
                    'font-ui text-[12.5px] font-medium text-muted',
                    index > 0 && 'mt-2.5',
                  )}
                >
                  <InlineView inline={block.inline} {...context} />
                </h4>
              );
            case 'paragraph':
              return (
                <p key={index}>
                  <InlineView inline={block.inline} {...context} />
                </p>
              );
            case 'list':
              return (
                <ul key={index} className="flex list-disc flex-col gap-1.5 pl-5 marker:text-faint">
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="pl-1">
                      <InlineView inline={item} {...context} />
                    </li>
                  ))}
                </ul>
              );
          }
        })}
      </div>
    </Tooltip.Provider>
  );
}

function InlineView({
  inline,
  notebookId,
  existingSourceIds,
  openCitation,
}: { inline: Inline[] } & Context) {
  return inline.map((token, index) => {
    if (token.type === 'text') return <Fragment key={index}>{token.text}</Fragment>;
    const { citation } = token;
    return (
      <CitationChip
        key={index}
        n={token.n}
        citation={citation}
        notebookId={notebookId}
        sourceExists={existingSourceIds.has(citation.sourceId)}
        open={isOpenCitation(openCitation, citation.sourceId, citation.ordinals)}
      />
    );
  });
}
