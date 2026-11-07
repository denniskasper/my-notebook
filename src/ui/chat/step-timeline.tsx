'use client';

import { Check, ChevronRight, X } from 'lucide-react';
import { useId, useState } from 'react';

import { cn } from '@/ui/cn';
import { plural, stepLabel, strings } from '@/ui/strings';

import type { StepView } from './events';

type Props = {
  steps: StepView[];
  /** While the run goes on, every Step shows; afterwards they fold into a count. */
  live: boolean;
};

/**
 * The Steps of an Agent run on the answer's rail: the running one in full
 * colour with a spinner, finished ones quieter with ✓ or ✗.
 */
export function StepTimeline({ steps, live }: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (steps.length === 0) return null;
  const expanded = live || open;

  return (
    <div className="mb-2.5 font-ui">
      {!live && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          title={open ? strings.agent.hideSteps : strings.agent.showSteps}
          onClick={() => setOpen((value) => !value)}
          className="-ml-1 flex items-center gap-1 rounded-[5px] px-1 py-0.5 text-[12px] text-muted transition-colors hover:text-text"
        >
          <ChevronRight
            size={12}
            aria-hidden
            className={cn(
              'transition-transform motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
          {plural(steps.length, strings.agent.stepCount)}
        </button>
      )}
      {expanded && (
        <ol id={listId} aria-label={strings.agent.steps} className={cn(!live && 'mt-1')}>
          {steps.map((step, index) => (
            <StepRow key={step.id} step={step} last={index === steps.length - 1} />
          ))}
        </ol>
      )}
    </div>
  );
}

function StepRow({ step, last }: { step: StepView; last: boolean }) {
  const running = step.status === 'running';
  return (
    <li
      data-status={step.status}
      className="relative grid grid-cols-[16px_1fr] gap-[9px] py-[3px] text-[12.5px] leading-[18px]"
    >
      {/* The rail between this Step and the next: the run reads as one sequence. */}
      {!last && (
        <span aria-hidden className="absolute top-[21px] bottom-[-3px] left-[7.5px] w-px bg-line" />
      )}
      <span className="mt-px grid size-4 place-items-center">
        <StepMarker status={step.status} />
      </span>
      <span className={cn('min-w-0 break-words', running ? 'text-text' : 'text-muted')}>
        {stepLabel(step.tool, step.argument)}
        <span className="sr-only">: {strings.agent.stepStatus[step.status]}</span>
      </span>
    </li>
  );
}

function StepMarker({ status }: { status: StepView['status'] }) {
  if (status === 'running') {
    return (
      <span
        aria-hidden
        className="size-[13px] rounded-full border-[1.5px] border-agent border-r-transparent motion-safe:animate-spin"
      />
    );
  }
  if (status === 'failed')
    return <X size={12} strokeWidth={2.25} aria-hidden className="text-danger" />;
  return <Check size={12} strokeWidth={2.25} aria-hidden className="text-ok" />;
}
