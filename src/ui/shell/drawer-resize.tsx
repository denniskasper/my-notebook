'use client';

import {
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { strings } from '@/ui/strings';

import {
  DRAWER_WIDTH,
  DRAWER_WIDTH_STORAGE_KEY,
  clampDrawerWidth,
  drawerWidthForKey,
  maxDrawerWidth,
  parseStoredDrawerWidth,
} from './drawer-width';

type DrawerWidth = {
  width: number;
  max: number;
  /** Shows the width while dragging, without writing it to storage yet. */
  preview: (width: number) => void;
  /** Sets the width and remembers it for this browser. */
  commit: (width: number) => void;
};

/**
 * The drawer width on the desktop layout. The server and the first client render use the
 * default; the stored width and the viewport bound apply right after hydration.
 */
export function useDrawerWidth(): DrawerWidth {
  const max = useSyncExternalStore(subscribeResize, viewportMax, () => DRAWER_WIDTH.max);
  const stored = useSyncExternalStore(subscribeStorage, readStoredWidth, () => null);
  const [local, setLocal] = useState<number | null>(null);
  const width = clampDrawerWidth(local ?? stored ?? DRAWER_WIDTH.default, max);
  return {
    width,
    max,
    preview: (next) => setLocal(clampDrawerWidth(next, max)),
    commit: (next) => {
      const clamped = clampDrawerWidth(next, max);
      setLocal(clamped);
      writeStoredWidth(clamped);
    },
  };
}

/** The `--drawer-w` custom property the drawer reads on the desktop layout. */
export function drawerWidthStyle(width: number): CSSProperties & Record<'--drawer-w', string> {
  return { '--drawer-w': `${width}px` };
}

type HandleProps = DrawerWidth & { controls: string };

/** The separator on the drawer's left edge: drag it, or focus it and use the arrow keys. */
export function DrawerResizeHandle({ width, max, preview, commit, controls }: HandleProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Keeps the drag from selecting text in the conversation.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    drag.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    preview(drag.current.startWidth + drag.current.startX - event.clientX);
  }

  function onPointerEnd() {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    commit(width);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = drawerWidthForKey(event.key, { width, max, large: event.shiftKey });
    if (next === null) return;
    event.preventDefault();
    commit(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={strings.drawer.resize}
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={DRAWER_WIDTH.min}
      aria-valuemax={max}
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 -left-[4px] z-10 hidden w-[7px] cursor-col-resize touch-none outline-none select-none after:absolute after:inset-y-0 after:left-[3px] after:w-px after:transition-colors hover:after:bg-faint focus-visible:after:left-[2px] focus-visible:after:w-[3px] focus-visible:after:bg-text data-dragging:after:bg-muted lg:block"
    />
  );
}

function subscribeResize(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function viewportMax(): number {
  return maxDrawerWidth(window.innerWidth);
}

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

// Storage can be missing or throw (private windows, blocked site data); the default width applies then.
function readStoredWidth(): number | null {
  try {
    return parseStoredDrawerWidth(window.localStorage.getItem(DRAWER_WIDTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredWidth(width: number): void {
  try {
    window.localStorage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Not remembered; the width still applies for this page view.
  }
}
