import { listNotebooks } from '@/modules/notebooks';
import { getSpendStatus, type SpendStatus } from '@/modules/usage';
import { currentVisitorId } from '@/modules/visitors';
import type { SidebarNotebook } from '@/ui/shell';

/**
 * The Visitor (if any), their Notebooks for the sidebar and spend against the
 * caps for the Kontingent meter and the Demo budget banner. Never creates a Visitor.
 */
export async function loadSidebar(): Promise<{
  visitorId: string | null;
  notebooks: SidebarNotebook[];
  spend: SpendStatus;
}> {
  const visitorId = await currentVisitorId();
  const [notebooks, spend] = await Promise.all([
    visitorId ? listNotebooks(visitorId) : Promise.resolve([]),
    getSpendStatus(visitorId),
  ]);
  return { visitorId, notebooks: notebooks.map(({ id, title }) => ({ id, title })), spend };
}
