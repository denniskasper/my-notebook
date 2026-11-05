import { Sidebar, Welcome, AppShell } from '@/ui/shell';

import { createNotebookAction } from './actions';
import { loadSidebar } from './sidebar-data';

export default async function HomePage() {
  const { notebooks } = await loadSidebar();
  return (
    <AppShell
      sidebar={<Sidebar notebooks={notebooks} createNotebook={createNotebookAction} />}
      header={null}
    >
      <Welcome createNotebook={createNotebookAction} />
    </AppShell>
  );
}
