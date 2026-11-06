'use client';

import type { ReactNode } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs';
import { strings } from '@/ui/strings';

/** Source reader, Studio outputs and Notes. Empty until the later slices fill them. */
export function Drawer({ closeButton }: { closeButton: ReactNode }) {
  const { tabs } = strings.drawer;
  return (
    <Tabs defaultValue="sources" className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center border-b border-line px-2">
        <TabsList className="flex-1">
          <TabsTrigger value="sources">
            {tabs.sources}
            <span className="ml-0.5 text-faint">0</span>
          </TabsTrigger>
          <TabsTrigger value="studio">{tabs.studio}</TabsTrigger>
          <TabsTrigger value="notes">{tabs.notes}</TabsTrigger>
        </TabsList>
        {closeButton}
      </div>
      <TabsContent value="sources">
        <EmptyTab>{strings.drawer.sourcesEmpty}</EmptyTab>
      </TabsContent>
      <TabsContent value="studio">
        <EmptyTab>{strings.drawer.studioEmpty}</EmptyTab>
      </TabsContent>
      <TabsContent value="notes">
        <EmptyTab>{strings.drawer.notesEmpty}</EmptyTab>
      </TabsContent>
    </Tabs>
  );
}

function EmptyTab({ children }: { children: ReactNode }) {
  return <p className="max-w-[46ch] px-6 py-7 leading-[1.55] text-muted">{children}</p>;
}
