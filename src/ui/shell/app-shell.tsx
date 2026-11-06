'use client';

import { Menu, PanelRight, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Button } from '@/ui/components/button';
import { cn } from '@/ui/cn';
import { strings } from '@/ui/strings';

import { Drawer } from './drawer';

type Props = {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  /** The Source / Studio / Notes drawer (only inside a Notebook). */
  drawer?: { reader: ReactNode; sourceCount: number; readerKey: string | null };
};

/**
 * Variant D: Notebook sidebar, conversation centre, Source / Studio / Notes drawer.
 * Below `md` the sidebar, below `lg` the drawer become overlays.
 */
export function AppShell({ sidebar, header, children, drawer }: Props) {
  const withDrawer = drawer !== undefined;
  const pathname = usePathname();
  // The mobile sidebar closes itself after navigating: it is open only for the path it was opened on.
  const [sidebarOpenOn, setSidebarOpenOn] = useState<string | null>(null);
  const sidebarOpen = sidebarOpenOn === pathname;
  // null = layout default (open on wide screens, closed on narrow ones). Opening a Source
  // opens the drawer too (and closes the mobile sidebar it was opened from).
  const readerKey = drawer?.readerKey ?? null;
  const [drawerOpen, setDrawerOpen] = useState<boolean | null>(readerKey ? true : null);
  const [shownReaderKey, setShownReaderKey] = useState(readerKey);
  if (readerKey !== shownReaderKey) {
    setShownReaderKey(readerKey);
    if (readerKey) {
      setDrawerOpen(true);
      setSidebarOpenOn(null);
    }
  }
  const drawerVisible = drawerOpen ?? 'default';

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        aria-label={strings.sidebar.label}
        className={cn(
          'w-[250px] shrink-0 flex-col border-r border-line bg-panel',
          sidebarOpen
            ? 'fixed inset-y-0 left-0 z-40 flex shadow-[0_0_40px_rgb(0_0_0/0.5)]'
            : 'hidden md:flex',
        )}
      >
        {sidebar}
      </aside>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpenOn(null)}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-line px-4 max-md:pl-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={strings.sidebar.label}
            onClick={() => setSidebarOpenOn(pathname)}
          >
            <Menu size={15} />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">{header}</div>
          {withDrawer && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={strings.drawer.toggle}
              aria-expanded={drawerOpen ?? undefined}
              onClick={() => setDrawerOpen((open) => !(open ?? isWide()))}
            >
              <PanelRight size={15} />
            </Button>
          )}
        </header>
        {children}
      </main>

      {drawer && (
        <aside
          aria-label={strings.drawer.label}
          className={cn(
            'w-[460px] max-w-full shrink-0 flex-col border-l border-line bg-panel',
            drawerVisible === 'default' && 'hidden lg:flex',
            drawerVisible === true &&
              'flex max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:shadow-[0_0_40px_rgb(0_0_0/0.5)]',
            drawerVisible === false && 'hidden',
          )}
        >
          <Drawer
            reader={drawer.reader}
            sourceCount={drawer.sourceCount}
            readerKey={drawer.readerKey}
            closeButton={
              <Button
                variant="ghost"
                size="icon"
                aria-label={strings.drawer.close}
                onClick={() => setDrawerOpen(false)}
              >
                <X size={14} />
              </Button>
            }
          />
        </aside>
      )}
    </div>
  );
}

function isWide(): boolean {
  return window.matchMedia('(min-width: 64rem)').matches;
}
