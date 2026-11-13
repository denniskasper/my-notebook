import { describe, expect, it } from 'vitest';

import {
  DRAWER_WIDTH,
  SIDEBAR_WIDTH,
  clampPanelWidth,
  maxPanelWidth,
  panelWidthForDrag,
  panelWidthForKey,
  parseStoredPanelWidth,
} from './panel-width';

describe('drawer (right side)', () => {
  describe('maxPanelWidth', () => {
    it('allows half the viewport', () => {
      expect(maxPanelWidth(DRAWER_WIDTH, 1200)).toBe(600);
    });

    it('caps at 720px on wide screens', () => {
      expect(maxPanelWidth(DRAWER_WIDTH, 2560)).toBe(720);
    });

    it('never drops below the minimum width', () => {
      expect(maxPanelWidth(DRAWER_WIDTH, 400)).toBe(280);
    });
  });

  describe('clampPanelWidth', () => {
    it('keeps a width inside the bounds', () => {
      expect(clampPanelWidth(DRAWER_WIDTH, 500, 720)).toBe(500);
    });

    it('raises a too-narrow width to the minimum', () => {
      expect(clampPanelWidth(DRAWER_WIDTH, 100, 720)).toBe(280);
    });

    it('lowers a too-wide width to the maximum', () => {
      expect(clampPanelWidth(DRAWER_WIDTH, 900, 600)).toBe(600);
    });

    it('rounds fractional pointer positions', () => {
      expect(clampPanelWidth(DRAWER_WIDTH, 456.6, 720)).toBe(457);
    });
  });

  describe('panelWidthForDrag', () => {
    it('widens when dragged left and narrows when dragged right', () => {
      expect(panelWidthForDrag(DRAWER_WIDTH, { startWidth: 460, startX: 800, x: 760 })).toBe(500);
      expect(panelWidthForDrag(DRAWER_WIDTH, { startWidth: 460, startX: 800, x: 840 })).toBe(420);
    });
  });

  describe('panelWidthForKey', () => {
    const at = (width: number, large = false) => ({ width, max: 720, large });

    it('widens with ArrowLeft and narrows with ArrowRight', () => {
      expect(panelWidthForKey(DRAWER_WIDTH, 'ArrowLeft', at(460))).toBe(476);
      expect(panelWidthForKey(DRAWER_WIDTH, 'ArrowRight', at(460))).toBe(444);
    });

    it('takes larger steps with Shift', () => {
      expect(panelWidthForKey(DRAWER_WIDTH, 'ArrowLeft', at(460, true))).toBe(524);
      expect(panelWidthForKey(DRAWER_WIDTH, 'ArrowRight', at(460, true))).toBe(396);
    });

    it('stays inside the bounds', () => {
      expect(panelWidthForKey(DRAWER_WIDTH, 'ArrowLeft', at(715))).toBe(720);
      expect(panelWidthForKey(DRAWER_WIDTH, 'ArrowRight', at(285))).toBe(280);
    });

    it('jumps to the bounds with Home and End', () => {
      expect(panelWidthForKey(DRAWER_WIDTH, 'Home', at(460))).toBe(280);
      expect(panelWidthForKey(DRAWER_WIDTH, 'End', at(460))).toBe(720);
    });

    it('ignores other keys', () => {
      expect(panelWidthForKey(DRAWER_WIDTH, 'ArrowUp', at(460))).toBeNull();
      expect(panelWidthForKey(DRAWER_WIDTH, 'Enter', at(460))).toBeNull();
    });
  });
});

describe('Notebook sidebar (left side)', () => {
  it('defaults to the original 250px', () => {
    expect(SIDEBAR_WIDTH.default).toBe(250);
  });

  describe('maxPanelWidth', () => {
    it('allows 30% of the viewport', () => {
      expect(maxPanelWidth(SIDEBAR_WIDTH, 1000)).toBe(300);
    });

    it('caps at 400px on wide screens', () => {
      expect(maxPanelWidth(SIDEBAR_WIDTH, 2560)).toBe(400);
    });

    it('never drops below the minimum width', () => {
      expect(maxPanelWidth(SIDEBAR_WIDTH, 500)).toBe(200);
    });
  });

  describe('clampPanelWidth', () => {
    it('keeps a width inside the bounds', () => {
      expect(clampPanelWidth(SIDEBAR_WIDTH, 320, 400)).toBe(320);
    });

    it('raises a too-narrow width to the minimum', () => {
      expect(clampPanelWidth(SIDEBAR_WIDTH, 120, 400)).toBe(200);
    });

    it('lowers a too-wide width to the maximum', () => {
      expect(clampPanelWidth(SIDEBAR_WIDTH, 600, 400)).toBe(400);
    });
  });

  describe('panelWidthForDrag', () => {
    it('widens when dragged right and narrows when dragged left', () => {
      expect(panelWidthForDrag(SIDEBAR_WIDTH, { startWidth: 250, startX: 250, x: 300 })).toBe(300);
      expect(panelWidthForDrag(SIDEBAR_WIDTH, { startWidth: 250, startX: 250, x: 220 })).toBe(220);
    });
  });

  describe('panelWidthForKey', () => {
    const at = (width: number, large = false) => ({ width, max: 400, large });

    it('widens with ArrowRight and narrows with ArrowLeft', () => {
      expect(panelWidthForKey(SIDEBAR_WIDTH, 'ArrowRight', at(250))).toBe(266);
      expect(panelWidthForKey(SIDEBAR_WIDTH, 'ArrowLeft', at(250))).toBe(234);
    });

    it('takes larger steps with Shift', () => {
      expect(panelWidthForKey(SIDEBAR_WIDTH, 'ArrowRight', at(250, true))).toBe(314);
      expect(panelWidthForKey(SIDEBAR_WIDTH, 'ArrowLeft', at(250, true))).toBe(200);
    });

    it('stays inside the bounds', () => {
      expect(panelWidthForKey(SIDEBAR_WIDTH, 'ArrowRight', at(395))).toBe(400);
      expect(panelWidthForKey(SIDEBAR_WIDTH, 'ArrowLeft', at(205))).toBe(200);
    });

    it('jumps to the bounds with Home and End', () => {
      expect(panelWidthForKey(SIDEBAR_WIDTH, 'Home', at(250))).toBe(200);
      expect(panelWidthForKey(SIDEBAR_WIDTH, 'End', at(250))).toBe(400);
    });

    it('ignores other keys', () => {
      expect(panelWidthForKey(SIDEBAR_WIDTH, 'ArrowDown', at(250))).toBeNull();
    });
  });

  it('remembers its width under its own storage key', () => {
    expect(SIDEBAR_WIDTH.storageKey).not.toBe(DRAWER_WIDTH.storageKey);
  });
});

describe('parseStoredPanelWidth', () => {
  it('reads a stored number', () => {
    expect(parseStoredPanelWidth('512')).toBe(512);
  });

  it('rejects missing or garbage values', () => {
    expect(parseStoredPanelWidth(null)).toBeNull();
    expect(parseStoredPanelWidth('wide')).toBeNull();
    expect(parseStoredPanelWidth('')).toBeNull();
    expect(parseStoredPanelWidth('-40')).toBeNull();
  });
});
