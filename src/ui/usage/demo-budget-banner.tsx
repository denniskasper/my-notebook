import { PauseCircle } from 'lucide-react';

import { errorMessage } from '@/ui/strings';

/** App-wide notice once the Demo budget (today's or the total) is used up. */
export function DemoBudgetBanner({ exhausted }: { exhausted: 'daily' | 'total' }) {
  return (
    <div
      role="status"
      className="flex min-h-[34px] shrink-0 items-center gap-2.5 border-b border-line bg-raise px-3.5 py-1.5"
    >
      <PauseCircle size={14} aria-hidden className="shrink-0 text-muted" />
      <p className="font-read text-[14.5px] leading-snug text-soft">
        {errorMessage(exhausted === 'total' ? 'demo_budget_total' : 'demo_budget_daily')}
      </p>
    </div>
  );
}
