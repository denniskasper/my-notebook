'use client';

import { ArrowUp, Eraser, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';

import { readSseEvents } from '@/platform/http';
import { cn } from '@/ui/cn';
import { errorMessage, strings, type ErrorCode } from '@/ui/strings';

import { chatEventSchema, type ChatEvent } from './events';
import { Message } from './message';
import type { SaveAsNote } from './save-as-note';
import type { MessagePartView, MessageView, OpenCitation } from './types';

// A server-side answer that is still streaming (e.g. after a reload) is polled at this pace.
const POLL_INTERVAL_MS = 1000;
// Within this distance of the bottom, the thread follows the streaming answer.
const STICK_DISTANCE_PX = 80;

type Props = {
  notebookId: string;
  /** The stored conversation, oldest first. */
  messages: MessageView[];
  /** Sources that still exist; Citations to others render as deleted. */
  existingSourceIds: readonly string[];
  openCitation: OpenCitation;
  /** Whether the Notebook has an enabled, ready Source to ground answers in. */
  canSubmitQuestion: boolean;
  /** e.g. „2 von 3 Quellen aktiv“ or „Keine Quellen“. */
  sourceSummary: string;
  questionMaxLength: number;
  clearChat: (formData: FormData) => Promise<void>;
  saveAsNote: SaveAsNote;
};

/** The question being answered right now, until the stored conversation has it. */
type Pending = {
  question: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  parts: MessagePartView[];
  status: MessageView['status'];
  errorCode: ErrorCode | null;
};

/** The Notebook's Chat: the conversation, the streaming answer and the composer. */
export function ChatPanel({
  notebookId,
  messages,
  existingSourceIds,
  openCitation,
  canSubmitQuestion,
  sourceSummary,
  questionMaxLength,
  clearChat,
  saveAsNote,
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const stopRef = useRef<AbortController | null>(null);
  const streaming = pending?.status === 'streaming';

  // The stored answer replaces the pending one once it is no longer streaming.
  const stored = pending?.assistantMessageId
    ? messages.find((message) => message.id === pending.assistantMessageId)
    : undefined;
  const showPending = pending !== null && (stored === undefined || stored.status === 'streaming');
  const pendingIds = new Set(
    showPending ? [pending.userMessageId, pending.assistantMessageId] : [],
  );
  const shown: MessageView[] = messages.filter((message) => !pendingIds.has(message.id));
  if (showPending) shown.push(...pendingViews(pending));

  useRefreshWhile(!streaming && messages.some((message) => message.status === 'streaming'));
  const { ref: threadRef, onScroll: onThreadScroll, stick } = useStickToBottom();
  const sources = new Set(existingSourceIds);
  const emptyBody = canSubmitQuestion ? strings.chat.emptyBody : strings.chat.noActiveSources;

  async function streamQuestion(question: string) {
    const stop = new AbortController();
    stopRef.current = stop;
    let started = false;
    setError(null);
    setDraft('');
    setPending({
      question,
      userMessageId: null,
      assistantMessageId: null,
      parts: [],
      status: 'streaming',
      errorCode: null,
    });
    stick();

    // Before `started` nothing was stored: give the question back to edit and resend.
    const refuse = (code: ErrorCode) => {
      setPending(null);
      setError(code);
      setDraft(question);
    };

    try {
      const response = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: stop.signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`Chat request failed: ${response.status}`);
      for await (const event of readSseEvents(response.body, chatEventSchema)) {
        if (event.type === 'started') started = true;
        if (event.type === 'error' && !started) refuse(event.error);
        else setPending((current) => current && apply(current, event));
      }
    } catch {
      if (stop.signal.aborted) {
        // Stopped before anything was stored: the refresh shows whatever the server kept.
        if (!started) setPending(null);
      } else if (started) {
        setPending(
          (current) => current && { ...current, status: 'failed', errorCode: 'llm_failed' },
        );
      } else {
        refuse('unknown');
      }
    } finally {
      stopRef.current = null;
      router.refresh();
    }
  }

  function stopAnswer() {
    stopRef.current?.abort();
    setPending((current) => current && { ...current, status: 'stopped' });
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const question = draft.trim();
    if (!canSubmitQuestion || streaming || question === '') return;
    void streamQuestion(question);
  }

  return (
    <>
      <div ref={threadRef} onScroll={onThreadScroll} className="flex scroll-area flex-1 px-6">
        {shown.length === 0 ? (
          <section className="m-auto w-full max-w-[700px] py-16">
            <h2 className="font-read text-[26px] leading-[1.2] font-normal tracking-[-0.01em] text-text">
              {strings.chat.emptyTitle}
            </h2>
            <p className="mt-3 max-w-[54ch] text-[13.5px] leading-[1.6] text-muted">{emptyBody}</p>
          </section>
        ) : (
          <div
            role="log"
            aria-label={strings.chat.label}
            className="mx-auto flex w-full max-w-[700px] flex-col gap-[22px] pt-6 pb-8"
          >
            {shown.map((message) => (
              <Message
                key={message.id}
                message={message}
                notebookId={notebookId}
                existingSourceIds={sources}
                openCitation={openCitation}
                saveAsNote={saveAsNote}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 px-5 pb-[18px]">
        {error && (
          <p
            role="alert"
            className="mx-auto mb-2 max-w-[700px] px-1 text-[12px] leading-snug text-danger"
          >
            {errorMessage(error, { max: questionMaxLength })}
          </p>
        )}
        <form
          onSubmit={submit}
          className="mx-auto max-w-[700px] rounded-[10px] border border-line bg-panel px-2.5 pt-2.5 pb-2 transition-colors focus-within:border-muted/60"
        >
          <AutoSizeTextarea
            value={draft}
            onChange={setDraft}
            onSubmit={() => submit()}
            disabled={!canSubmitQuestion}
            maxLength={questionMaxLength}
          />
          <div className="flex items-center gap-2">
            <div className="inline-flex gap-0.5 rounded-md border border-line p-0.5" aria-hidden>
              {/* Agent mode arrives with its own slice. */}
              <span className="flex h-[22px] items-center rounded-sm bg-raise px-2.5 text-[12px]">
                {strings.conversation.modeChat}
              </span>
              <span className="flex h-[22px] items-center rounded-sm px-2.5 text-[12px] text-faint">
                {strings.conversation.modeAgent}
              </span>
            </div>
            <span className="min-w-0 truncate text-[11.5px] text-faint">{sourceSummary}</span>
            <span className="flex-1" />
            {shown.length > 0 && (
              <ClearChatButton
                notebookId={notebookId}
                disabled={streaming}
                clearChat={clearChat}
                onCleared={() => setPending(null)}
              />
            )}
            {streaming ? (
              <button
                type="button"
                onClick={stopAnswer}
                aria-label={strings.chat.stop}
                title={strings.chat.stop}
                className="grid size-7 place-items-center rounded-md border border-line text-text hover:bg-hover"
              >
                <Square size={11} fill="currentColor" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSubmitQuestion || draft.trim() === ''}
                aria-label={strings.conversation.send}
                title={strings.conversation.send}
                className="grid size-7 place-items-center rounded-md bg-text text-bg transition-opacity disabled:opacity-30"
              >
                <ArrowUp size={14} aria-hidden />
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

/** Folds one streamed event into the pending answer. */
function apply(pending: Pending, event: ChatEvent): Pending {
  switch (event.type) {
    case 'started':
      return {
        ...pending,
        userMessageId: event.userMessageId,
        assistantMessageId: event.assistantMessageId,
      };
    case 'text':
      return {
        ...pending,
        parts: withPart(pending.parts, event.part, (part) => ({
          ...part,
          text: part.text + event.text,
        })),
      };
    case 'citation':
      return {
        ...pending,
        parts: withPart(pending.parts, event.part, (part) => ({
          ...part,
          citations: [...part.citations, event.citation],
        })),
      };
    case 'done':
      // A stop the Visitor asked for already shows as stopped.
      return pending.status === 'streaming' ? { ...pending, status: event.status } : pending;
    case 'error':
      return { ...pending, status: 'failed', errorCode: event.error };
  }
}

function withPart(
  parts: MessagePartView[],
  index: number,
  update: (part: MessagePartView) => MessagePartView,
): MessagePartView[] {
  const next = [...parts];
  while (next.length <= index) next.push({ text: '', citations: [] });
  next[index] = update(next[index] ?? { text: '', citations: [] });
  return next;
}

function pendingViews(pending: Pending): MessageView[] {
  return [
    {
      id: pending.userMessageId ?? 'pending-question',
      role: 'user',
      status: 'complete',
      errorCode: null,
      parts: [{ text: pending.question, citations: [] }],
      stored: false,
    },
    {
      id: pending.assistantMessageId ?? 'pending-answer',
      role: 'assistant',
      status: pending.status,
      errorCode: pending.errorCode,
      parts: pending.parts,
      stored: false,
    },
  ];
}

type TextareaProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  maxLength: number;
};

/** Grows with the question up to a few lines; Enter sends, Shift+Enter breaks the line. */
function AutoSizeTextarea({ value, onChange, onSubmit, disabled, maxLength }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 42), 168)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      name="question"
      value={value}
      disabled={disabled}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onSubmit();
        }
      }}
      aria-label={strings.conversation.composerPlaceholder}
      placeholder={
        disabled ? strings.chat.noActiveSources : strings.conversation.composerPlaceholder
      }
      className="block h-[42px] w-full resize-none bg-transparent text-[13.5px] leading-[1.5] outline-none placeholder:text-faint disabled:cursor-not-allowed"
    />
  );
}

type ClearProps = {
  notebookId: string;
  disabled: boolean;
  clearChat: (formData: FormData) => Promise<void>;
  onCleared: () => void;
};

function ClearChatButton({ notebookId, disabled, clearChat, onCleared }: ClearProps) {
  return (
    <form
      action={async (formData) => {
        await clearChat(formData);
        onCleared();
      }}
      onSubmit={(event) => {
        if (!window.confirm(strings.chat.clearConfirm)) event.preventDefault();
      }}
      className="flex"
    >
      <input type="hidden" name="notebookId" value={notebookId} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={strings.chat.clear}
        title={strings.chat.clear}
        className={cn(
          'grid size-7 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-text disabled:opacity-30',
        )}
      >
        <Eraser size={13} aria-hidden />
      </button>
    </form>
  );
}

/** Re-renders the page from the server while `active`, so a stored answer catches up. */
function useRefreshWhile(active: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
}

/** Keeps the thread scrolled to the newest text, unless the Visitor scrolled up to read. */
function useStickToBottom() {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && stuck.current) element.scrollTop = element.scrollHeight;
  });
  return {
    ref,
    onScroll: () => {
      const element = ref.current;
      if (!element) return;
      stuck.current =
        element.scrollHeight - element.scrollTop - element.clientHeight < STICK_DISTANCE_PX;
    },
    stick: () => {
      stuck.current = true;
    },
  };
}
