import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { getNotebook, NOTEBOOK_TITLE_MAX_LENGTH } from '@/modules/notebooks';
import {
  getSourceWithPassages,
  listSources,
  SOURCE_TEXT_MAX_LENGTH,
  SOURCE_TITLE_MAX_LENGTH,
  type Source,
} from '@/modules/sources';
import { env } from '@/platform/env';
import { AppShell, EmptyConversation, NotebookHeader, Sidebar } from '@/ui/shell';
import {
  AddTextSourceDialog,
  SourceList,
  SourceReader,
  SourceReaderMissing,
  type SourceLimits,
  type SourceView,
} from '@/ui/sources';
import { strings, toErrorCode } from '@/ui/strings';

import {
  addTextSourceAction,
  createNotebookAction,
  deleteNotebookAction,
  deleteSourceAction,
  renameNotebookAction,
  retrySourceAction,
  setSourceEnabledAction,
} from '../../actions';
import { loadSidebar } from '../../sidebar-data';
import { parseReaderParams } from './reader-params';

type Props = {
  params: Promise<{ notebookId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadNotebook(params: Props['params']) {
  const notebookId = z.uuid().safeParse((await params).notebookId);
  const sidebar = await loadSidebar();
  if (!notebookId.success || !sidebar.visitorId) notFound();
  const notebook = await getNotebook(sidebar.visitorId, notebookId.data);
  if (!notebook) notFound();
  return { visitorId: sidebar.visitorId, notebook, notebooks: sidebar.notebooks };
}

function toSourceView(source: Source): SourceView {
  return {
    id: source.id,
    kind: source.kind,
    title: source.title,
    status: source.status,
    errorCode: source.errorCode === null ? null : toErrorCode(source.errorCode),
    enabled: source.enabled,
    tokenCount: source.tokenCount,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { notebook } = await loadNotebook(params);
  return { title: `${notebook.title} – ${strings.app.name}` };
}

export default async function NotebookPage({ params, searchParams }: Props) {
  const { visitorId, notebook, notebooks } = await loadNotebook(params);
  const readerParams = parseReaderParams(await searchParams);
  const [sources, opened] = await Promise.all([
    listSources(visitorId, notebook.id),
    readerParams.sourceId
      ? getSourceWithPassages(visitorId, notebook.id, readerParams.sourceId)
      : Promise.resolve(null),
  ]);

  const limits: SourceLimits = {
    tokenCap: env().SOURCE_TOKEN_CAP,
    titleMax: SOURCE_TITLE_MAX_LENGTH,
    textMax: SOURCE_TEXT_MAX_LENGTH,
  };
  const sourceViews = sources.map(toSourceView);
  const active = sources.filter((source) => source.status === 'ready' && source.enabled).length;
  const notebookPath = `/notebooks/${notebook.id}`;

  let reader = null;
  if (opened) {
    reader = (
      <SourceReader
        source={toSourceView(opened.source)}
        passages={opened.passages}
        highlight={readerParams.ordinals}
        closeHref={notebookPath}
        limits={limits}
      />
    );
  } else if (readerParams.sourceId) {
    reader = <SourceReaderMissing />;
  }

  return (
    <AppShell
      drawer={{
        reader,
        sourceCount: sources.length,
        readerKey:
          readerParams.sourceId && `${readerParams.sourceId}:${readerParams.ordinals.join(',')}`,
      }}
      sidebar={
        <Sidebar
          notebooks={notebooks}
          activeNotebookId={notebook.id}
          createNotebook={createNotebookAction}
          activeNotebookSources={
            <>
              <SourceList
                notebookId={notebook.id}
                sources={sourceViews}
                openSourceId={opened?.source.id ?? null}
                limits={limits}
                actions={{
                  setEnabled: setSourceEnabledAction,
                  retry: retrySourceAction,
                  remove: deleteSourceAction,
                }}
              />
              <AddTextSourceDialog
                placement="sidebar"
                notebookId={notebook.id}
                limits={limits}
                addTextSource={addTextSourceAction}
              />
            </>
          }
        />
      }
      header={
        <NotebookHeader
          key={notebook.title}
          notebook={{ id: notebook.id, title: notebook.title }}
          sourceSummary={{ active, total: sources.length }}
          maxTitleLength={NOTEBOOK_TITLE_MAX_LENGTH}
          renameNotebook={renameNotebookAction}
          deleteNotebook={deleteNotebookAction}
        />
      }
    >
      <EmptyConversation
        addTextSource={
          <AddTextSourceDialog
            placement="conversation"
            notebookId={notebook.id}
            limits={limits}
            addTextSource={addTextSourceAction}
          />
        }
      />
    </AppShell>
  );
}
