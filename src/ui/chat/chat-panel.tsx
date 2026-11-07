'use client';

import { ArrowUp, Eraser, Hourglass, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';

import { readSseEvents } from '@/platform/http';
import { cn } from '@/ui/cn';
import { errorMessage, retryValues, strings, type ErrorCode } from '@/ui/strings';

import { chatEventSchema, type ChatEvent } from './events';
import { Message } from './message';
import type { SaveAsNote } from './save-as-note';
import type { MessagePartView, MessageView, OpenCitation, TextPartView } from './types';

type Mode = MessageView['mode'];

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
  /** Spend caps that close the composer until `retryAt` (ISO; null: not on its own). */
  blocked: ComposerBlock | null;
  /** e.g. „2 von 3 Quellen aktiv“ or „Keine Quellen“. */
  sourceSummary: string;
  questionMaxLength: number;
  taskMaxLength: number;
  clearChat: (formData: FormData) => Promise<void>;
  saveAsNote: SaveAsNote;
};

export type ComposerBlock = {
  code: 'daily_allowance' | 'demo_budget_daily' | 'demo_budget_total';
  retryAt: string | null;
};

/** A refused or failed question, with the values its message needs. */
type ComposerError = { code: ErrorCode; values: Record<string, string | number> };

/** The question being answered right now, until the stored conversation has it. */
type Pending = {
  mode: Mode;
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
  blocked,
  sourceSummary,
  questionMaxLength,
  taskMaxLength,
  clearChat,
  saveAsNote,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('chat');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<ComposerError | null>(null);
  const stopRef = useRef<AbortController | null>(null);
  const streaming = pending?.status === 'streaming';
  const agentMode = mode === 'agent';
  // The Agent may also work on a Notebook whose Sources are all switched off (it says so).
  const composerOpen = (agentMode || canSubmitQuestion) && blocked === null;
  const maxLength = agentMode ? taskMaxLength : questionMaxLength;
  // The Demo budget has its app-wide banner; only the Visitor's own allowance is told here.
  const allowanceMessage = blocked?.code === 'daily_allowance' ? allowanceText(blocked) : null;

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

  async function streamQuestion(question: string, mode: Mode) {
    const stop = new AbortController();
    stopRef.current = stop;
    let started = false;
    setError(null);
    setDraft('');
    setPending({
      mode,
      question,
      userMessageId: null,
      assistantMessageId: null,
      parts: [],
      status: 'streaming',
      errorCode: null,
    });
    stick();

    // Before `started` nothing was stored: give the question back to edit and resend.
    const refuse = (code: ErrorCode, retryAt?: string) => {
      setPending(null);
      setError({
        code,
        values: {
          max: mode === 'agent' ? taskMaxLength : questionMaxLength,
          ...(retryAt && retryValues(retryAt, new Date())),
        },
      });
      setDraft(question);
    };

    try {
      const response = await fetch(`/api/notebooks/${notebookId}/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode === 'agent' ? { task: question } : { question }),
        signal: stop.signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`Chat request failed: ${response.status}`);
      for await (const event of readSseEvents(response.body, chatEventSchema)) {
        if (event.type === 'started') started = true;
        // A Note the Agent wrote shows up in the Notes tab right away.
        if (event.type === 'note_created') router.refresh();
        if (event.type === 'error' && !started) refuse(event.error, event.retryAt);
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
    if (!composerOpen || streaming || question === '') return;
    void streamQuestion(question, mode);
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
        {allowanceMessage ? (
          <p
            role="status"
            className="mx-auto mb-2 flex max-w-[700px] items-center gap-2 px-1 text-[12.5px] leading-snug text-soft"
          >
            <Hourglass size={12} aria-hidden className="shrink-0 text-muted" />
            {allowanceMessage}
          </p>
        ) : (
          error && (
            <p
              role="alert"
              className="mx-auto mb-2 max-w-[700px] px-1 text-[12px] leading-snug text-danger"
            >
              {errorMessage(error.code, error.values)}
            </p>
          )
        )}
        <form
          onSubmit={submit}
          data-mode={mode}
          className={cn(
            'mx-auto max-w-[700px] rounded-[10px] border bg-panel px-2.5 pt-2.5 pb-2 transition-[border-color,box-shadow]',
            agentMode
              ? 'border-agent-line shadow-[0_0_0_3px_var(--color-agent-bg)]'
              : 'border-line focus-within:border-muted/60',
          )}
        >
          <AutoSizeTextarea
            value={draft}
            onChange={setDraft}
            onSubmit={() => submit()}
            disabled={!composerOpen}
            disabledHint={blocked ? strings.usage.composerPaused : strings.chat.noActiveSources}
            placeholder={
              agentMode
                ? strings.conversation.agentPlaceholder
                : strings.conversation.composerPlaceholder
            }
            maxLength={maxLength}
          />
          <div className="flex items-center gap-2">
            <ModeSwitch mode={mode} onChange={setMode} disabled={streaming} />
            <span className="min-w-0 truncate text-[11.5px] text-faint">
              {agentMode ? strings.conversation.agentScope : sourceSummary}
            </span>
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
                aria-label={pending?.mode === 'agent' ? strings.agent.stop : strings.chat.stop}
                title={pending?.mode === 'agent' ? strings.agent.stop : strings.chat.stop}
                className="grid size-7 place-items-center rounded-md border border-line text-text hover:bg-hover"
              >
                <Square size={11} fill="currentColor" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!composerOpen || draft.trim() === ''}
                aria-label={strings.conversation.send}
                title={strings.conversation.send}
                className={cn(
                  'grid size-7 place-items-center rounded-md transition-opacity disabled:opacity-30',
                  agentMode ? 'bg-agent text-bg' : 'bg-text text-bg',
                )}
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
function allowanceText(blocked: ComposerBlock): string {
  const values = blocked.retryAt ? retryValues(blocked.retryAt, new Date()) : {};
  return errorMessage(blocked.code, values);
}

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
        parts: withTextPart(pending.parts, event.part, (part) => ({
          ...part,
          text: part.text + event.text,
        })),
      };
    case 'citation':
      return {
        ...pending,
        parts: withTextPart(pending.parts, event.part, (part) => ({
          ...part,
          citations: [...part.citations, event.citation],
        })),
      };
    case 'step': {
      const parts = [...pending.parts];
      while (parts.length < event.part) parts.push(emptyText());
      parts[event.part] = event.step;
      return { ...pending, parts };
    }
    case 'note_created':
      return pending;
    case 'done':
      // A stop the Visitor asked for already shows as stopped.
      if (pending.status !== 'streaming') return pending;
      return { ...pending, status: event.status, errorCode: event.reason ?? null };
    case 'error':
      return { ...pending, status: 'failed', errorCode: event.error };
  }
}

const emptyText = (): TextPartView => ({ type: 'text', text: '', citations: [] });

function withTextPart(
  parts: MessagePartView[],
  index: number,
  update: (part: TextPartView) => TextPartView,
): MessagePartView[] {
  const next = [...parts];
  while (next.length <= index) next.push(emptyText());
  const current = next[index];
  next[index] = update(current?.type === 'text' ? current : emptyText());
  return next;
}

function pendingViews(pending: Pending): MessageView[] {
  return [
    {
      id: pending.userMessageId ?? 'pending-question',
      role: 'user',
      mode: pending.mode,
      status: 'complete',
      errorCode: null,
      parts: [{ type: 'text', text: pending.question, citations: [] }],
      stored: false,
    },
    {
      id: pending.assistantMessageId ?? 'pending-answer',
      role: 'assistant',
      mode: pending.mode,
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
  /** The placeholder while disabled: why the composer is closed. */
  disabledHint: string;
  placeholder: string;
  maxLength: number;
};

/** Grows with the question up to a few lines; Enter sends, Shift+Enter breaks the line. */
function AutoSizeTextarea({
  value,
  onChange,
  onSubmit,
  disabled,
  disabledHint,
  placeholder,
  maxLength,
}: TextareaProps) {
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
      aria-label={placeholder}
      placeholder={disabled ? disabledHint : placeholder}
      className="block h-[42px] w-full resize-none bg-transparent text-[13.5px] leading-[1.5] outline-none placeholder:text-faint disabled:cursor-not-allowed"
    />
  );
}

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'chat', label: strings.conversation.modeChat },
  { mode: 'agent', label: strings.conversation.modeAgent },
];

/** Chat or Agent for the next message; periwinkle marks Agent. */
function ModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={strings.conversation.modeLabel}
      className="inline-flex shrink-0 gap-0.5 rounded-md border border-line p-0.5"
    >
      {MODES.map((option) => {
        const on = option.mode === mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(option.mode)}
            className={cn(
              'flex h-[22px] items-center rounded-sm px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed',
              !on && 'text-faint hover:text-text',
              on && option.mode === 'chat' && 'bg-raise text-text',
              on && option.mode === 'agent' && 'bg-agent-bg text-agent',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
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
