import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { getNotebook, NOTEBOOK_TITLE_MAX_LENGTH } from '@/modules/notebooks';
import { strings } from '@/ui/strings';
import { EmptyConversation, NotebookHeader, Sidebar, WorkspaceShell } from '@/ui/workspace';

import { createNotebookAction, deleteNotebookAction, renameNotebookAction } from '../../actions';
import { loadWorkspace } from '../../workspace-data';

type Props = { params: Promise<{ notebookId: string }> };

async function loadNotebook(params: Props['params']) {
  const notebookId = z.uuid().safeParse((await params).notebookId);
  const workspace = await loadWorkspace();
  if (!notebookId.success || !workspace.visitorId) notFound();
  const notebook = await getNotebook(workspace.visitorId, notebookId.data);
  if (!notebook) notFound();
  return { notebook, notebooks: workspace.notebooks };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { notebook } = await loadNotebook(params);
  return { title: `${notebook.title} – ${strings.app.name}` };
}

export default async function NotebookPage({ params }: Props) {
  const { notebook, notebooks } = await loadNotebook(params);
  return (
    <WorkspaceShell
      withDrawer
      sidebar={
        <Sidebar
          notebooks={notebooks}
          activeNotebookId={notebook.id}
          createNotebook={createNotebookAction}
        />
      }
      header={
        <NotebookHeader
          key={notebook.title}
          notebook={{ id: notebook.id, title: notebook.title }}
          maxTitleLength={NOTEBOOK_TITLE_MAX_LENGTH}
          renameNotebook={renameNotebookAction}
          deleteNotebook={deleteNotebookAction}
        />
      }
    >
      <EmptyConversation />
    </WorkspaceShell>
  );
}
