import { Sparkles } from 'lucide-react';
import { Tooltip } from 'radix-ui';

import { cn } from '@/ui/cn';
import { errorMessage, strings } from '@/ui/strings';

import { CitationChip, isOpenCitation, TextWithChips } from './citation-chip';
import type { StepView } from './events';
import { SaveAsNoteButton, type SaveAsNote } from './save-as-note';
import { splitLinks } from './links';
import { StepTimeline } from './step-timeline';
import type { MessageView, OpenCitation, TextPartView } from './types';

type Context = {
  notebookId: string;
  existingSourceIds: ReadonlySet<string>;
  openCitation: OpenCitation;
  saveAsNote: SaveAsNote;
};

const isText = (part: MessageView['parts'][number]): part is TextPartView => part.type === 'text';
const isStep = (part: MessageView['parts'][number]): part is StepView => part.type === 'step';

/** A question or task (right, compact) or an answer (left, set like the Sources it cites). */
export function Message({ message, ...context }: { message: MessageView } & Context) {
  if (message.role === 'user') {
    const agent = message.mode === 'agent';
    return (
      <div className="flex justify-end">
        <p
          aria-label={agent ? strings.conversation.modeAgent : strings.chat.question}
          className={cn(
            'max-w-[82%] rounded-[10px_10px_3px_10px] border px-3 py-2 text-[13.5px] leading-[1.5] whitespace-pre-wrap text-text',
            agent ? 'border-agent-line bg-agent-bg' : 'border-line bg-raise',
          )}
        >
          {message.parts
            .filter(isText)
            .map((part) => part.text)
            .join('')}
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
  const agent = message.mode === 'agent';
  const streaming = message.status === 'streaming';
  const texts = message.parts.filter(isText);
  const steps = message.parts.filter(isStep);
  const empty = texts.every((part) => part.text === '' && part.citations.length === 0);
  // Chips are numbered through the whole answer: part i's first chip follows those before it.
  const firstNumber = texts.map(
    (_, index) => 1 + texts.slice(0, index).reduce((sum, part) => sum + part.citations.length, 0),
  );
  // An Agent run's header and Steps show its progress until it writes.
  const showWriting = empty && streaming && !agent;

  let stoppedNote: string | null = null;
  if (message.status === 'stopped') {
    stoppedNote = agent ? strings.agent.stopped : strings.chat.stopped;
    if (agent && message.errorCode) stoppedNote += `: ${errorMessage(message.errorCode)}`;
  }

  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
      <article
        aria-label={agent ? strings.agent.answer : strings.chat.answer}
        aria-busy={streaming || undefined}
        data-status={message.status}
        data-mode={message.mode}
        className={cn(
          'font-read text-[15.5px] leading-[1.7] text-soft',
          agent && 'border-l-2 border-agent-line pl-[14px]',
        )}
      >
        {agent && (
          <p className="mb-2 flex items-center gap-[7px] font-ui text-[12.5px] font-medium text-agent">
            {/* Pulses while the run goes on: between Steps, the model is thinking. */}
            <Sparkles
              size={13}
              aria-hidden
              className={cn(streaming && 'motion-safe:animate-pulse')}
            />
            {streaming ? strings.agent.working : strings.agent.name}
          </p>
        )}
        {agent && (
          <StepTimeline steps={steps} live={streaming} costMicroUsd={message.costMicroUsd} />
        )}
        {showWriting && (
          // Keeps the answer's line height, so the text replaces it without a jump.
          <p role="status" className="font-ui text-faint">
            <span className="text-[12px]">
              {strings.chat.writing}
              <Caret />
            </span>
          </p>
        )}
        {!empty && (
          <p className="whitespace-pre-wrap">
            {texts.map((part, index) => (
              <span key={index}>
                <TextWithChips
                  text={part.text}
                  renderText={(text) => (agent ? <TextWithLinks text={text} /> : text)}
                >
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
                </TextWithChips>
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
        {stoppedNote && <p className="mt-1.5 font-ui text-[11.5px] text-faint">{stoppedNote}</p>}
        {message.status === 'failed' && (
          <p role="alert" className={cn('font-ui text-[12px] text-danger', !empty && 'mt-1.5')}>
            {errorMessage(message.errorCode ?? 'unknown')}
          </p>
        )}
      </article>
    </Tooltip.Provider>
  );
}

/**
 * Agent text with the web pages it read but did not add as plain links: quiet
 * and underlined in the text's own colour, so they never pass for a Citation.
 */
function TextWithLinks({ text }: { text: string }) {
  return splitLinks(text).map((segment, index) =>
    segment.type === 'text' ? (
      segment.text
    ) : (
      <a
        key={index}
        href={segment.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="break-all text-text underline decoration-line underline-offset-[3px] transition-colors hover:decoration-muted focus-visible:rounded-[2px] focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-muted"
      >
        {segment.href}
      </a>
    ),
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
