/** A side panel whose width can be dragged on the desktop layout. Widths are CSS pixels. */
export type PanelWidthConfig = {
  /** Which edge of the screen the panel sits on; its resize handle sits on the opposite edge. */
  side: 'left' | 'right';
  min: number;
  default: number;
  max: number;
  /** The largest share of the viewport the panel may take, so the conversation stays usable. */
  maxViewportShare: number;
  storageKey: string;
  /** The custom property the panel reads its width from. */
  cssVar: `--${string}`;
};

/** The Source / Studio / Notes drawer on the right. */
export const DRAWER_WIDTH: PanelWidthConfig = {
  side: 'right',
  min: 280,
  default: 460,
  max: 720,
  maxViewportShare: 0.5,
  storageKey: 'drawer-width',
  cssVar: '--drawer-w',
};

/** The Notebook sidebar on the left. */
export const SIDEBAR_WIDTH: PanelWidthConfig = {
  side: 'left',
  min: 200,
  default: 250,
  max: 400,
  maxViewportShare: 0.3,
  storageKey: 'sidebar-width',
  cssVar: '--sidebar-w',
};

const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

/** The widest the panel may get in this viewport: its share of the viewport, capped at its max. */
export function maxPanelWidth(config: PanelWidthConfig, viewportWidth: number): number {
  const share = Math.floor(viewportWidth * config.maxViewportShare);
  return Math.max(config.min, Math.min(config.max, share));
}

export function clampPanelWidth(config: PanelWidthConfig, width: number, max: number): number {
  return Math.round(Math.min(Math.max(width, config.min), max));
}

/** The width after dragging the handle from `startX` to `x`: the panel grows away from its screen edge. */
export function panelWidthForDrag(
  config: PanelWidthConfig,
  { startWidth, startX, x }: { startWidth: number; startX: number; x: number },
): number {
  const delta = x - startX;
  return config.side === 'left' ? startWidth + delta : startWidth - delta;
}

/**
 * The new width after a key press on the separator, or null when the key does not resize.
 * The arrow pointing away from the panel's screen edge widens it: ArrowRight for the left
 * sidebar, ArrowLeft for the right drawer.
 */
export function panelWidthForKey(
  config: PanelWidthConfig,
  key: string,
  { width, max, large }: { width: number; max: number; large: boolean },
): number | null {
  const step = large ? KEY_STEP_LARGE : KEY_STEP;
  const widen = config.side === 'left' ? 'ArrowRight' : 'ArrowLeft';
  const narrow = config.side === 'left' ? 'ArrowLeft' : 'ArrowRight';
  switch (key) {
    case widen:
      return clampPanelWidth(config, width + step, max);
    case narrow:
      return clampPanelWidth(config, width - step, max);
    case 'Home':
      return config.min;
    case 'End':
      return max;
    default:
      return null;
  }
}

/** A width read back from storage, or null when it is missing or not a usable number. */
export function parseStoredPanelWidth(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const width = Number(raw);
  if (!Number.isFinite(width) || width <= 0) return null;
  return width;
}
