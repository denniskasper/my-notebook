import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { getNotebook, NOTEBOOK_TITLE_MAX_LENGTH } from '@/modules/notebooks';
import { strings } from '@/ui/strings';
import { EmptyConversation, NotebookHeader, Sidebar, AppShell } from '@/ui/shell';

import { createNotebookAction, deleteNotebookAction, renameNotebookAction } from '../../actions';
import { loadSidebar } from '../../sidebar-data';

type Props = { params: Promise<{ notebookId: string }> };

async function loadNotebook(params: Props['params']) {
  const notebookId = z.uuid().safeParse((await params).notebookId);
  const sidebar = await loadSidebar();
  if (!notebookId.success || !sidebar.visitorId) notFound();
  const notebook = await getNotebook(sidebar.visitorId, notebookId.data);
  if (!notebook) notFound();
  return { notebook, notebooks: sidebar.notebooks };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { notebook } = await loadNotebook(params);
  return { title: `${notebook.title} – ${strings.app.name}` };
}

export default async function NotebookPage({ params }: Props) {
  const { notebook, notebooks } = await loadNotebook(params);
  return (
    <AppShell
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
    </AppShell>
  );
}
