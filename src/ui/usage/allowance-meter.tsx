import { format, formatClock, strings } from '@/ui/strings';

import { allowanceLeftPercent } from './allowance';

type Props = {
  spentMicroUsd: number;
  limitMicroUsd: number;
  /** ISO time the Daily allowance resets (midnight in Berlin). */
  resetsAt: string;
};

/** The quiet Kontingent meter in the sidebar footer: how much of today's Daily allowance is left. */
export function AllowanceMeter({ spentMicroUsd, limitMicroUsd, resetsAt }: Props) {
  const percent = allowanceLeftPercent({ spentMicroUsd, limitMicroUsd });
  const label = format(strings.usage.meterLeft, { percent });
  return (
    <div
      className="shrink-0 border-t border-line px-3.5 pt-2.5 pb-3"
      title={format(strings.usage.meterHint, { time: formatClock(new Date(resetsAt)) })}
    >
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span id="allowance-meter-label" className="text-faint">
          {strings.usage.meterLabel}
        </span>
        <span className="text-muted tabular-nums">{label}</span>
      </div>
      <div
        role="meter"
        aria-labelledby="allowance-meter-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={label}
        className="mt-1.5 h-[2px] overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-muted transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
