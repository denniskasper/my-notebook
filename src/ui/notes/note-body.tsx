import { Tooltip } from 'radix-ui';
import { Fragment } from 'react';

import { CitationChip, isOpenCitation, type OpenCitation } from '@/ui/chat';
import { cn } from '@/ui/cn';

import { parseNoteMarkdown, type Block, type Inline } from './markdown';
import type { NoteView } from './types';

type Props = {
  note: NoteView;
  notebookId: string;
  existingSourceIds: ReadonlySet<string>;
  openCitation: OpenCitation;
};

/** A Note's Markdown, set like an answer; its markers are the same amber Citation chips. */
export function NoteBody({ note, ...context }: Props) {
  const blocks = parseNoteMarkdown(note.body, new Set(Object.keys(note.citations)));
  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <div className="flex flex-col gap-3 font-read text-[15.5px] leading-[1.7] text-soft">
        {blocks.map((block, index) => (
          <BlockView key={index} block={block} note={note} {...context} />
        ))}
      </div>
    </Tooltip.Provider>
  );
}

function BlockView({ block, ...context }: { block: Block } & Props) {
  switch (block.type) {
    case 'heading':
      return (
        <p
          role="heading"
          aria-level={block.level + 2}
          className={cn(
            'leading-[1.3] text-text',
            block.level === 1 ? 'mt-1 text-[19px]' : 'text-[16.5px] font-medium',
          )}
        >
          <InlineView inline={block.inline} {...context} />
        </p>
      );
    case 'paragraph':
      return (
        <p className="whitespace-pre-wrap">
          <InlineView inline={block.inline} {...context} />
        </p>
      );
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List
          className={cn(
            'flex flex-col gap-1 pl-5 marker:text-faint',
            block.ordered ? 'list-decimal' : 'list-disc',
          )}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              <InlineView inline={item} {...context} />
            </li>
          ))}
        </List>
      );
    }
  }
}

function InlineView({
  inline,
  note,
  notebookId,
  existingSourceIds,
  openCitation,
}: { inline: Inline[] } & Props) {
  return inline.map((token, index) => {
    switch (token.type) {
      case 'text':
        return <Fragment key={index}>{token.text}</Fragment>;
      case 'strong':
        return (
          <strong key={index} className="font-semibold text-text">
            {token.text}
          </strong>
        );
      case 'em':
        return <em key={index}>{token.text}</em>;
      case 'code':
        return (
          <code key={index} className="rounded-[3px] bg-raise px-1 font-ui text-[12.5px]">
            {token.text}
          </code>
        );
      case 'citation': {
        const citation = note.citations[token.marker];
        if (!citation) return null;
        return (
          <CitationChip
            key={index}
            n={Number(token.marker)}
            citation={citation}
            notebookId={notebookId}
            sourceExists={existingSourceIds.has(citation.sourceId)}
            open={isOpenCitation(openCitation, citation.sourceId, citation.ordinals)}
            keep={{ note: note.id }}
          />
        );
      }
    }
  });
}
