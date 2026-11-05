import { listNotebooks } from '@/modules/notebooks';
import { currentVisitorId } from '@/modules/visitors';
import type { SidebarNotebook } from '@/ui/workspace';

/** The Visitor (if any) and their Notebooks for the sidebar. Never creates a Visitor. */
export async function loadWorkspace(): Promise<{
  visitorId: string | null;
  notebooks: SidebarNotebook[];
}> {
  const visitorId = await currentVisitorId();
  if (!visitorId) return { visitorId, notebooks: [] };
  const notebooks = await listNotebooks(visitorId);
  return { visitorId, notebooks: notebooks.map(({ id, title }) => ({ id, title })) };
}
