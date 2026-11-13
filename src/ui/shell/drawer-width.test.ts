import { describe, expect, it } from 'vitest';

import {
  DRAWER_WIDTH,
  clampDrawerWidth,
  drawerWidthForKey,
  maxDrawerWidth,
  parseStoredDrawerWidth,
} from './drawer-width';

describe('maxDrawerWidth', () => {
  it('allows half the viewport', () => {
    expect(maxDrawerWidth(1200)).toBe(600);
  });

  it('caps at 720px on wide screens', () => {
    expect(maxDrawerWidth(2560)).toBe(720);
  });

  it('never drops below the minimum width', () => {
    expect(maxDrawerWidth(400)).toBe(DRAWER_WIDTH.min);
  });
});

describe('clampDrawerWidth', () => {
  it('keeps a width inside the bounds', () => {
    expect(clampDrawerWidth(500, 720)).toBe(500);
  });

  it('raises a too-narrow width to the minimum', () => {
    expect(clampDrawerWidth(100, 720)).toBe(280);
  });

  it('lowers a too-wide width to the maximum', () => {
    expect(clampDrawerWidth(900, 600)).toBe(600);
  });

  it('rounds fractional pointer positions', () => {
    expect(clampDrawerWidth(456.6, 720)).toBe(457);
  });
});

describe('drawerWidthForKey', () => {
  const at = (width: number, large = false) => ({ width, max: 720, large });

  it('widens with ArrowLeft and narrows with ArrowRight', () => {
    expect(drawerWidthForKey('ArrowLeft', at(460))).toBe(476);
    expect(drawerWidthForKey('ArrowRight', at(460))).toBe(444);
  });

  it('takes larger steps with Shift', () => {
    expect(drawerWidthForKey('ArrowLeft', at(460, true))).toBe(524);
    expect(drawerWidthForKey('ArrowRight', at(460, true))).toBe(396);
  });

  it('stays inside the bounds', () => {
    expect(drawerWidthForKey('ArrowLeft', at(715))).toBe(720);
    expect(drawerWidthForKey('ArrowRight', at(285))).toBe(280);
  });

  it('jumps to the bounds with Home and End', () => {
    expect(drawerWidthForKey('Home', at(460))).toBe(280);
    expect(drawerWidthForKey('End', at(460))).toBe(720);
  });

  it('ignores other keys', () => {
    expect(drawerWidthForKey('ArrowUp', at(460))).toBeNull();
    expect(drawerWidthForKey('Enter', at(460))).toBeNull();
  });
});

describe('parseStoredDrawerWidth', () => {
  it('reads a stored number', () => {
    expect(parseStoredDrawerWidth('512')).toBe(512);
  });

  it('rejects missing or garbage values', () => {
    expect(parseStoredDrawerWidth(null)).toBeNull();
    expect(parseStoredDrawerWidth('wide')).toBeNull();
    expect(parseStoredDrawerWidth('')).toBeNull();
    expect(parseStoredDrawerWidth('-40')).toBeNull();
  });
});
