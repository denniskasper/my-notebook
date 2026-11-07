import type { SpendStatus } from '@/modules/usage';
import { AllowanceMeter, DemoBudgetBanner } from '@/ui/usage';

/** The Demo budget banner (only once it is used up) and the Kontingent meter, for every page. */
export function usageChrome(spend: SpendStatus) {
  const { allowance, demoBudget } = spend;
  return {
    banner: demoBudget.exhausted && <DemoBudgetBanner exhausted={demoBudget.exhausted} />,
    meter: (
      <AllowanceMeter
        spentMicroUsd={allowance.spentMicroUsd}
        limitMicroUsd={allowance.limitMicroUsd}
        resetsAt={allowance.resetsAt.toISOString()}
      />
    ),
  };
}
