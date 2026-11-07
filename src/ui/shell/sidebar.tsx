import { BookOpen, ChevronDown, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { SubmitButton } from '@/ui/components/submit-button';
import { cn } from '@/ui/cn';
import { strings } from '@/ui/strings';

export type SidebarNotebook = { id: string; title: string };

type Props = {
  notebooks: SidebarNotebook[];
  activeNotebookId?: string;
  createNotebook: () => Promise<void>;
  /** The open Notebook's Sources and the way to add one, nested under it. */
  activeNotebookSources?: ReactNode;
  /** Pinned below the list (the Kontingent meter). */
  footer?: ReactNode;
};

/** Notebook list; the open Notebook unfolds to show its Sources. */
export function Sidebar({
  notebooks,
  activeNotebookId,
  createNotebook,
  activeNotebookSources,
  footer,
}: Props) {
  return (
    <>
      <Link
        href="/"
        className="flex h-[42px] shrink-0 items-center gap-2 px-3.5 font-semibold tracking-[-0.005em]"
      >
        <BookOpen size={15} aria-hidden />
        {strings.app.name}
      </Link>
      <h2 className="px-3.5 pt-2.5 pb-1 text-[11.5px] font-normal text-faint">
        {strings.sidebar.heading}
      </h2>
      <nav className="scroll-area flex-1 px-1.5 pb-3">
        {notebooks.length === 0 && (
          <p className="px-2.5 py-1.5 text-[12px] leading-normal text-faint">
            {strings.sidebar.empty}
          </p>
        )}
        <ul>
          {notebooks.map((notebook) => {
            const active = notebook.id === activeNotebookId;
            return (
              <li key={notebook.id}>
                <Link
                  href={`/notebooks/${notebook.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-muted hover:bg-hover hover:text-text',
                    active && 'text-text',
                  )}
                >
                  {active ? (
                    <ChevronDown size={13} aria-hidden className="shrink-0" />
                  ) : (
                    <BookOpen size={13} aria-hidden className="shrink-0" />
                  )}
                  <span className="truncate">{notebook.title}</span>
                </Link>
                {active && activeNotebookSources && (
                  <div className="mb-1.5 ml-[18px] border-l border-line pl-1">
                    {activeNotebookSources}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <form action={createNotebook}>
          <SubmitButton
            variant="ghost"
            className="h-auto w-full justify-start gap-2 rounded-[5px] px-2.5 py-1.5 font-normal"
          >
            <Plus size={13} aria-hidden />
            {strings.sidebar.newNotebook}
          </SubmitButton>
        </form>
      </nav>
      {footer}
    </>
  );
}
