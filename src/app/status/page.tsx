import type { Metadata } from 'next';
import Link from 'next/link';

import { getSpendStatus, type SpendStatus } from '@/modules/usage';
import { pingDatabase } from '@/platform/db';
import { env } from '@/platform/env';
import { cn } from '@/ui/cn';
import { format, formatClock, formatUsd, strings } from '@/ui/strings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: `${strings.status.title} – ${strings.app.name}` };

/** Spend needs the database; without it the page still shows the commit. */
async function loadSpend(): Promise<SpendStatus['demoBudget'] | null> {
  try {
    return (await getSpendStatus(null)).demoBudget;
  } catch {
    return null;
  }
}

function spentPercent(spent: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.round((spent / limit) * 100));
}

/** The public Status page: running commit, database health and AI spend against the Demo budget. */
export default async function StatusPage() {
  const { status } = strings;
  const databaseOk = await pingDatabase();
  const spend = databaseOk ? await loadSpend() : null;
  const commit = env().COMMIT;
  const spendRows = [
    {
      id: 'today',
      label: status.spendToday,
      hint: status.spendTodayHint,
      spent: spend?.spentTodayMicroUsd,
      limit: spend?.dailyLimitMicroUsd,
    },
    {
      id: 'total',
      label: status.spendTotal,
      hint: status.spendTotalHint,
      spent: spend?.spentTotalMicroUsd,
      limit: spend?.totalLimitMicroUsd,
    },
  ];

  return (
    <main className="flex scroll-area min-h-dvh px-6">
      <section className="m-auto w-full max-w-[560px] py-16">
        <h1 className="text-[12.5px] font-medium text-muted">{status.title}</h1>
        <p className="mt-3 flex items-baseline gap-3 font-read text-[30px] leading-[1.15] tracking-[-0.015em]">
          <span
            aria-hidden
            className={cn(
              'inline-block size-2.5 shrink-0 translate-y-[-0.2em] rounded-full',
              databaseOk ? 'bg-ok shadow-[0_0_0_4px_rgb(127_200_160/0.12)]' : 'bg-danger',
            )}
          />
          {databaseOk ? status.verdict.ok : status.verdict.down}
        </p>
        <p className="mt-2 text-[12px] text-faint tabular-nums">
          {format(status.checkedAt, { time: formatClock(new Date()) })}
        </p>

        <dl className="mt-10 border-t border-line">
          <div className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
            <dt className="text-muted">{status.commit}</dt>
            <dd className="text-text tabular-nums" title={commit}>
              {commit.slice(0, 12)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-6 border-b border-line py-3.5">
            <dt className="text-muted">{status.database.label}</dt>
            <dd className={databaseOk ? 'text-ok' : 'text-danger'}>
              {databaseOk ? status.database.ok : status.database.down}
            </dd>
          </div>
          {spendRows.map((row) => {
            const labelId = `status-spend-${row.id}`;
            if (row.spent === undefined || row.limit === undefined) {
              return (
                <div
                  key={row.id}
                  className="flex items-baseline justify-between gap-6 border-b border-line py-3.5"
                >
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="text-faint">{status.spendUnavailable}</dd>
                </div>
              );
            }
            const percent = spentPercent(row.spent, row.limit);
            const amount = format(status.spendOf, {
              spent: formatUsd(row.spent),
              limit: formatUsd(row.limit),
            });
            return (
              <div key={row.id} className="border-b border-line py-3.5">
                <div className="flex items-baseline justify-between gap-6">
                  <dt id={labelId} className="text-muted">
                    {row.label}
                  </dt>
                  <dd className="text-text tabular-nums">{amount}</dd>
                </div>
                <dd>
                  <div
                    role="meter"
                    aria-labelledby={labelId}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-valuetext={amount}
                    className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-hover"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full',
                        percent >= 100 ? 'bg-danger' : 'bg-soft',
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-faint">{row.hint}</p>
                </dd>
              </div>
            );
          })}
        </dl>

        <Link
          href="/"
          className="mt-8 inline-block text-soft underline decoration-line underline-offset-4 hover:text-text"
        >
          {status.back}
        </Link>
      </section>
    </main>
  );
}
