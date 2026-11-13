/** Width bounds of the drawer on the desktop layout, in CSS pixels. */
export const DRAWER_WIDTH = { min: 280, default: 460, max: 720 } as const;

export const DRAWER_WIDTH_STORAGE_KEY = 'drawer-width';

const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

/** The widest the drawer may get: half the viewport (so the conversation stays usable), capped at 720px. */
export function maxDrawerWidth(viewportWidth: number): number {
  return Math.max(DRAWER_WIDTH.min, Math.min(DRAWER_WIDTH.max, Math.floor(viewportWidth / 2)));
}

export function clampDrawerWidth(width: number, max: number): number {
  return Math.round(Math.min(Math.max(width, DRAWER_WIDTH.min), max));
}

/**
 * The new width after a key press on the separator, or null when the key does not resize.
 * The separator sits on the drawer's left edge, so ArrowLeft widens and ArrowRight narrows.
 */
export function drawerWidthForKey(
  key: string,
  { width, max, large }: { width: number; max: number; large: boolean },
): number | null {
  const step = large ? KEY_STEP_LARGE : KEY_STEP;
  switch (key) {
    case 'ArrowLeft':
      return clampDrawerWidth(width + step, max);
    case 'ArrowRight':
      return clampDrawerWidth(width - step, max);
    case 'Home':
      return DRAWER_WIDTH.min;
    case 'End':
      return max;
    default:
      return null;
  }
}

/** A width read back from storage, or null when it is missing or not a usable number. */
export function parseStoredDrawerWidth(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const width = Number(raw);
  if (!Number.isFinite(width) || width <= 0) return null;
  return width;
}
