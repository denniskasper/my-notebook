'use client';

import { useState, type ReactNode } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs';
import { strings } from '@/ui/strings';

type Props = {
  closeButton: ReactNode;
  /** The Source reader, or null when no Source is open. */
  reader: ReactNode;
  /** The Notes tab. */
  notes: ReactNode;
  sourceCount: number;
  /** Changes whenever a Source (or Passage) or a Note is opened; brings its tab to the front. */
  focus: DrawerFocus;
};

export type DrawerFocus = { key: string; tab: 'sources' | 'notes' } | null;

/** Source reader, Studio outputs and Notes. Studio waits for its slice. */
export function Drawer({ closeButton, reader, notes, sourceCount, focus }: Props) {
  const { tabs } = strings.drawer;
  const [tab, setTab] = useState<string>(focus?.tab ?? 'sources');
  const [shownKey, setShownKey] = useState(focus?.key ?? null);
  if ((focus?.key ?? null) !== shownKey) {
    setShownKey(focus?.key ?? null);
    if (focus) setTab(focus.tab);
  }
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center border-b border-line px-2">
        <TabsList className="flex-1">
          <TabsTrigger value="sources">
            {tabs.sources}
            <span className="ml-0.5 text-faint tabular-nums">{sourceCount}</span>
          </TabsTrigger>
          <TabsTrigger value="studio">{tabs.studio}</TabsTrigger>
          <TabsTrigger value="notes">{tabs.notes}</TabsTrigger>
        </TabsList>
        {closeButton}
      </div>
      <TabsContent value="sources">
        {reader ?? <EmptyTab>{strings.drawer.sourcesEmpty}</EmptyTab>}
      </TabsContent>
      <TabsContent value="studio">
        <EmptyTab>{strings.drawer.studioEmpty}</EmptyTab>
      </TabsContent>
      <TabsContent value="notes">{notes}</TabsContent>
    </Tabs>
  );
}

function EmptyTab({ children }: { children: ReactNode }) {
  return <p className="max-w-[46ch] px-6 py-7 leading-[1.55] text-muted">{children}</p>;
}
