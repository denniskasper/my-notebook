import { Tooltip } from 'radix-ui';

import { cn } from '@/ui/cn';
import { errorMessage, strings } from '@/ui/strings';

import { CitationChip, isOpenCitation } from './citation-chip';
import { SaveAsNoteButton, type SaveAsNote } from './save-as-note';
import type { MessageView, OpenCitation } from './types';

type Context = {
  notebookId: string;
  existingSourceIds: ReadonlySet<string>;
  openCitation: OpenCitation;
  saveAsNote: SaveAsNote;
};

/** A question (right, compact) or an answer (left, set like the Sources it cites). */
export function Message({ message, ...context }: { message: MessageView } & Context) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p
          aria-label={strings.chat.question}
          className="max-w-[82%] rounded-[10px_10px_3px_10px] border border-line bg-raise px-3 py-2 text-[13.5px] leading-[1.5] whitespace-pre-wrap text-text"
        >
          {message.parts.map((part) => part.text).join('')}
        </p>
      </div>
    );
  }
  return <Answer message={message} {...context} />;
}

function Answer({
  message,
  notebookId,
  existingSourceIds,
  openCitation,
  saveAsNote,
}: { message: MessageView } & Context) {
  const streaming = message.status === 'streaming';
  const empty = message.parts.every((part) => part.text === '' && part.citations.length === 0);
  // Chips are numbered through the whole answer: part i's first chip follows those before it.
  const firstNumber = message.parts.map(
    (_, index) =>
      1 + message.parts.slice(0, index).reduce((sum, part) => sum + part.citations.length, 0),
  );

  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <article
        aria-label={strings.chat.answer}
        aria-busy={streaming || undefined}
        data-status={message.status}
        className="font-read text-[15.5px] leading-[1.7] text-soft"
      >
        {empty && streaming ? (
          <p role="status" className="font-ui text-[12px] text-faint">
            {strings.chat.writing}
            <Caret />
          </p>
        ) : (
          <p className="whitespace-pre-wrap">
            {message.parts.map((part, index) => (
              <span key={index}>
                {part.text}
                {part.citations.map((citation, citationIndex) => {
                  const n = (firstNumber[index] ?? 1) + citationIndex;
                  return (
                    <CitationChip
                      key={n}
                      n={n}
                      citation={citation}
                      notebookId={notebookId}
                      sourceExists={existingSourceIds.has(citation.sourceId)}
                      open={isOpenCitation(openCitation, citation.sourceId, citation.ordinals)}
                    />
                  );
                })}
              </span>
            ))}
            {streaming && <Caret />}
          </p>
        )}
        {!streaming && !empty && message.status !== 'failed' && message.stored && (
          <SaveAsNoteButton
            notebookId={notebookId}
            messageId={message.id}
            saveAsNote={saveAsNote}
          />
        )}
        {message.status === 'stopped' && (
          <p className="mt-1.5 font-ui text-[11.5px] text-faint">{strings.chat.stopped}</p>
        )}
        {message.status === 'failed' && (
          <p role="alert" className={cn('font-ui text-[12px] text-danger', !empty && 'mt-1.5')}>
            {errorMessage(message.errorCode ?? 'unknown')}
          </p>
        )}
      </article>
    </Tooltip.Provider>
  );
}

/** Where the answer is being written. */
function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-muted motion-safe:animate-[caret-blink_1s_steps(2,start)_infinite]"
    />
  );
}
