'use client';

import {
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { cn } from '@/ui/cn';

import {
  clampPanelWidth,
  maxPanelWidth,
  panelWidthForDrag,
  panelWidthForKey,
  parseStoredPanelWidth,
  type PanelWidthConfig,
} from './panel-width';

type PanelWidth = {
  config: PanelWidthConfig;
  width: number;
  max: number;
  /** Shows the width while dragging, without writing it to storage yet. */
  preview: (width: number) => void;
  /** Sets the width and remembers it for this browser. */
  commit: (width: number) => void;
};

/**
 * A panel's width on the desktop layout. The server and the first client render use the
 * default; the stored width and the viewport bound apply right after hydration.
 */
export function usePanelWidth(config: PanelWidthConfig): PanelWidth {
  const max = useSyncExternalStore(
    subscribeResize,
    () => maxPanelWidth(config, window.innerWidth),
    () => config.max,
  );
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => readStoredWidth(config.storageKey),
    () => null,
  );
  const [local, setLocal] = useState<number | null>(null);
  const width = clampPanelWidth(config, local ?? stored ?? config.default, max);
  return {
    config,
    width,
    max,
    preview: (next) => setLocal(clampPanelWidth(config, next, max)),
    commit: (next) => {
      const clamped = clampPanelWidth(config, next, max);
      setLocal(clamped);
      writeStoredWidth(config.storageKey, clamped);
    },
  };
}

/** The custom property (e.g. `--drawer-w`) the panel reads on the desktop layout. */
export function panelWidthStyle({ config, width }: PanelWidth): CSSProperties {
  const style: Record<`--${string}`, string> = { [config.cssVar]: `${width}px` };
  return style;
}

type HandleProps = PanelWidth & {
  label: string;
  controls: string;
  /** Shows the handle only where the panel sits in the layout, e.g. `md:block`. */
  className: string;
};

/** The separator on the panel's inner edge: drag it, or focus it and use the arrow keys. */
export function PanelResizeHandle({
  config,
  width,
  max,
  preview,
  commit,
  label,
  controls,
  className,
}: HandleProps) {
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
    preview(panelWidthForDrag(config, { ...drag.current, x: event.clientX }));
  }

  function onPointerEnd() {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    commit(width);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = panelWidthForKey(config, event.key, { width, max, large: event.shiftKey });
    if (next === null) return;
    event.preventDefault();
    commit(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={config.min}
      aria-valuemax={max}
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      className={cn(
        'absolute inset-y-0 z-10 hidden w-[7px] cursor-col-resize touch-none outline-none select-none after:absolute after:inset-y-0 after:w-px after:transition-colors hover:after:bg-faint focus-visible:after:w-[3px] focus-visible:after:bg-text data-dragging:after:bg-muted',
        config.side === 'right'
          ? '-left-[4px] after:left-[3px] focus-visible:after:left-[2px]'
          : '-right-[4px] after:right-[3px] focus-visible:after:right-[2px]',
        className,
      )}
    />
  );
}

function subscribeResize(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

// Storage can be missing or throw (private windows, blocked site data); the default width applies then.
function readStoredWidth(key: string): number | null {
  try {
    return parseStoredPanelWidth(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStoredWidth(key: string, width: number): void {
  try {
    window.localStorage.setItem(key, String(width));
  } catch {
    // Not remembered; the width still applies for this page view.
  }
}
