import { Sidebar, Welcome, WorkspaceShell } from '@/ui/workspace';

import { createNotebookAction } from './actions';
import { loadWorkspace } from './workspace-data';

export default async function HomePage() {
  const { notebooks } = await loadWorkspace();
  return (
    <WorkspaceShell
      sidebar={<Sidebar notebooks={notebooks} createNotebook={createNotebookAction} />}
      header={null}
    >
      <Welcome createNotebook={createNotebookAction} />
    </WorkspaceShell>
  );
}
