import { ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';

import { strings } from '@/ui/strings';

/** The conversation centre of a Notebook without Sources: an invitation to add one. */
export function EmptyConversation({ addSource }: { addSource: ReactNode }) {
  const { conversation } = strings;
  return (
    <>
      <div className="flex scroll-area flex-1 px-6">
        <section className="m-auto w-full max-w-[700px] py-16">
          <h2 className="font-read text-[26px] leading-[1.2] font-normal tracking-[-0.01em] text-text">
            {conversation.emptyTitle}
          </h2>
          <p className="mt-3 max-w-[54ch] text-[13.5px] leading-[1.6] text-muted">
            {conversation.emptyBody}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {addSource}
          </div>
        </section>
      </div>
      <Composer />
    </>
  );
}

/** The Chat composer, disabled until the Notebook has a Source. */
function Composer() {
  const { conversation } = strings;
  return (
    <div className="shrink-0 px-5 pb-[18px]">
      <div className="mx-auto max-w-[700px] rounded-[10px] border border-line bg-panel px-2.5 pt-2.5 pb-2">
        <textarea
          disabled
          aria-label={conversation.composerPlaceholder}
          placeholder={conversation.composerDisabled}
          className="block h-[42px] w-full resize-none bg-transparent text-[13.5px] outline-none placeholder:text-faint"
        />
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-0.5 rounded-md border border-line p-0.5" aria-hidden>
            <span className="flex h-[22px] items-center rounded-sm bg-raise px-2.5 text-[12px]">
              {conversation.modeChat}
            </span>
            <span className="flex h-[22px] items-center rounded-sm px-2.5 text-[12px] text-faint">
              {conversation.modeAgent}
            </span>
          </div>
          <span className="text-[11.5px] text-faint">{strings.notebook.noSources}</span>
          <button
            type="button"
            disabled
            aria-label={conversation.send}
            className="ml-auto grid size-7 place-items-center rounded-md bg-text text-bg disabled:opacity-30"
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
