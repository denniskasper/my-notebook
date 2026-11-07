import { buildInfo } from '@/platform/build';
import { AppShell, Sidebar, Welcome } from '@/ui/shell';
import { errorMessage } from '@/ui/strings';

import { createNotebookAction } from './actions';
import { loadSidebar } from './sidebar-data';
import { usageChrome } from './usage-chrome';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HomePage({ searchParams }: Props) {
  const [{ notebooks, spend }, params] = await Promise.all([loadSidebar(), searchParams]);
  const { banner, meter } = usageChrome(spend);
  // Set by createNotebookAction when this IP may not start another Visitor today.
  const error = params.error === 'visitor_limit' ? errorMessage('visitor_limit') : null;
  return (
    <AppShell
      banner={banner}
      sidebar={
        <Sidebar
          notebooks={notebooks}
          createNotebook={createNotebookAction}
          footer={meter}
          build={buildInfo()}
        />
      }
      header={null}
    >
      <Welcome createNotebook={createNotebookAction} error={error} />
    </AppShell>
  );
}
