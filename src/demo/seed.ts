import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { createNotebook } from '@/modules/notebooks';
import { addTextSource, processSource, type Source } from '@/modules/sources';
import { createVisitor } from '@/modules/visitors';

const NOTEBOOK_TITLE = 'KI-Verordnung';
const NOTES_SOURCE_FILE = path.join('sources', 'meine-notizen.md');
// Git-ignored: extracted text of the PDF and URL Sources, if the developer has it.
const LOCAL_DIR = 'local';
const LOCAL_EXTENSIONS = new Set(['.md', '.txt']);

type DemoSource = { title: string; text: string };

/** A fixture file: the first line (without a leading `#`) is the title, the rest the text. */
function parseDemoSource(content: string): DemoSource {
  const [firstLine = '', ...rest] = content.split(/\r?\n/);
  return { title: firstLine.replace(/^#+\s*/, ''), text: rest.join('\n') };
}

async function localFiles(demoDir: string): Promise<string[]> {
  try {
    const names = await readdir(path.join(demoDir, LOCAL_DIR));
    return names
      .filter((name) => LOCAL_EXTENSIONS.has(path.extname(name)))
      .sort()
      .map((name) => path.join(LOCAL_DIR, name));
  } catch {
    return [];
  }
}

/** The demo text Source first, then any local copies in file-name order. */
async function loadDemoSources(demoDir: string): Promise<DemoSource[]> {
  const files = [NOTES_SOURCE_FILE, ...(await localFiles(demoDir))];
  return Promise.all(
    files.map(async (file) => parseDemoSource(await readFile(path.join(demoDir, file), 'utf8'))),
  );
}

/**
 * Creates a Notebook with the demo Sources, processed to `ready`, for local
 * development and e2e tests. Uses the given Visitor, or creates one.
 */
export async function seedDemoNotebook(options: {
  demoDir: string;
  visitorId?: string;
}): Promise<{ visitorId: string; notebookId: string; sources: Source[] }> {
  const demoSources = await loadDemoSources(options.demoDir);
  const visitorId = options.visitorId ?? (await createVisitor({ ipHash: null }));
  const notebook = await createNotebook(visitorId, NOTEBOOK_TITLE);

  const sources: Source[] = [];
  for (const demoSource of demoSources) {
    const added = await addTextSource(visitorId, notebook.id, demoSource);
    if (!added) throw new Error('The demo Notebook disappeared while seeding');
    const processed = await processSource(added.id);
    if (!processed) throw new Error(`Demo Source "${demoSource.title}" was not processed`);
    sources.push(processed);
  }
  return { visitorId, notebookId: notebook.id, sources };
}
