import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { listMessages, QUESTION_MAX_LENGTH, type ChatMessage } from '@/modules/chat';
import { getNotebook, NOTEBOOK_TITLE_MAX_LENGTH } from '@/modules/notebooks';
import { listNotes, NOTE_BODY_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH, type Note } from '@/modules/notes';
import {
  getSourceWithPassages,
  listSources,
  PDF_MAX_BYTES,
  SOURCE_TEXT_MAX_LENGTH,
  SOURCE_TITLE_MAX_LENGTH,
  type Source,
} from '@/modules/sources';
import { env } from '@/platform/env';
import { ChatPanel, type MessageView, type OpenCitation } from '@/ui/chat';
import { NotesPanel, type NoteView } from '@/ui/notes';
import { AppShell, EmptyConversation, NotebookHeader, Sidebar, type DrawerFocus } from '@/ui/shell';
import {
  AddSource,
  SourceList,
  SourceReader,
  SourceReaderMissing,
  type SourceLimits,
  type SourceView,
} from '@/ui/sources';
import { format, strings, toErrorCode } from '@/ui/strings';

import {
  addTextSourceAction,
  clearChatAction,
  createNoteAction,
  createNotebookAction,
  deleteNoteAction,
  deleteNotebookAction,
  deleteSourceAction,
  renameNotebookAction,
  retrySourceAction,
  saveAnswerAsNoteAction,
  setSourceEnabledAction,
  updateNoteAction,
} from '../../actions';
import { loadSidebar } from '../../sidebar-data';
import { usageChrome } from '../../usage-chrome';
import { parseNoteParam, parseReaderParams } from './reader-params';

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
  return {
    visitorId: sidebar.visitorId,
    notebook,
    notebooks: sidebar.notebooks,
    spend: sidebar.spend,
  };
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

function toMessageView(message: ChatMessage): MessageView {
  return {
    id: message.id,
    role: message.role,
    status: message.status,
    errorCode: message.errorCode === null ? null : toErrorCode(message.errorCode),
    parts: message.parts.map(({ text, citations }) => ({ text, citations })),
    stored: true,
  };
}

function toNoteView(note: Note): NoteView {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    citations: note.citations,
    updatedAt: note.updatedAt,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { notebook } = await loadNotebook(params);
  return { title: `${notebook.title} – ${strings.app.name}` };
}

export default async function NotebookPage({ params, searchParams }: Props) {
  const { visitorId, notebook, notebooks, spend } = await loadNotebook(params);
  const { banner, meter } = usageChrome(spend);
  const query = await searchParams;
  const readerParams = parseReaderParams(query);
  const openNoteId = parseNoteParam(query);
  const [sources, messages, notes, opened] = await Promise.all([
    listSources(visitorId, notebook.id),
    listMessages(visitorId, notebook.id),
    listNotes(visitorId, notebook.id),
    readerParams.sourceId
      ? getSourceWithPassages(visitorId, notebook.id, readerParams.sourceId)
      : Promise.resolve(null),
  ]);

  const limits: SourceLimits = {
    tokenCap: env().SOURCE_TOKEN_CAP,
    titleMax: SOURCE_TITLE_MAX_LENGTH,
    textMax: SOURCE_TEXT_MAX_LENGTH,
    pdfMaxBytes: PDF_MAX_BYTES,
  };
  const sourceViews = sources.map(toSourceView);
  const active = sources.filter((source) => source.status === 'ready' && source.enabled).length;
  const notebookPath = `/notebooks/${notebook.id}`;
  const openCitation: OpenCitation = readerParams.sourceId
    ? { sourceId: readerParams.sourceId, ordinals: readerParams.ordinals }
    : null;
  const sourceIds = sources.map((source) => source.id);
  // A Citation opened from a Note keeps `?note=`: the reader comes to the front, the Note stays open.
  let drawerFocus: DrawerFocus = null;
  if (readerParams.sourceId) {
    drawerFocus = {
      key: `${readerParams.sourceId}:${readerParams.ordinals.join(',')}`,
      tab: 'sources',
    };
  } else if (openNoteId) {
    drawerFocus = { key: `note:${openNoteId}`, tab: 'notes' };
  }
  const chatSourceSummary =
    sources.length === 0
      ? strings.notebook.noSources
      : format(strings.notebook.activeSources, { count: active, total: sources.length });

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
      banner={banner}
      drawer={{
        reader,
        notes: (
          <NotesPanel
            notebookId={notebook.id}
            notes={notes.map(toNoteView)}
            openNoteId={openNoteId}
            existingSourceIds={sourceIds}
            openCitation={openCitation}
            limits={{ titleMax: NOTE_TITLE_MAX_LENGTH, bodyMax: NOTE_BODY_MAX_LENGTH }}
            actions={{
              create: createNoteAction,
              update: updateNoteAction,
              remove: deleteNoteAction,
            }}
          />
        ),
        sourceCount: sources.length,
        focus: drawerFocus,
      }}
      sidebar={
        <Sidebar
          notebooks={notebooks}
          activeNotebookId={notebook.id}
          createNotebook={createNotebookAction}
          footer={meter}
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
              <AddSource
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
      {sources.length === 0 && messages.length === 0 ? (
        <EmptyConversation
          addSource={
            <AddSource
              placement="conversation"
              notebookId={notebook.id}
              limits={limits}
              addTextSource={addTextSourceAction}
            />
          }
        />
      ) : (
        <ChatPanel
          notebookId={notebook.id}
          messages={messages.map(toMessageView)}
          existingSourceIds={sourceIds}
          openCitation={openCitation}
          canSubmitQuestion={active > 0}
          blocked={
            spend.blocked && {
              code: spend.blocked.reason,
              retryAt: spend.blocked.retryAt?.toISOString() ?? null,
            }
          }
          sourceSummary={chatSourceSummary}
          questionMaxLength={QUESTION_MAX_LENGTH}
          clearChat={clearChatAction}
          saveAsNote={saveAnswerAsNoteAction}
        />
      )}
    </AppShell>
  );
}
