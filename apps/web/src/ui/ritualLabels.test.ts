import { RITUAL_IDS } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import { RITUAL_BUTTON_KEYS, RITUAL_TOAST_KEYS, ritualNoticeKey } from './ritualLabels';

describe('ritual labels', () => {
  it('has a button text and a toast text for every ritual', () => {
    for (const id of RITUAL_IDS) {
      expect(RITUAL_BUTTON_KEYS[id]).toMatch(/^ritual\./);
      expect(RITUAL_TOAST_KEYS[id]).toMatch(/^toast\./);
    }
  });

  it('explains why a ritual did not start', () => {
    expect(ritualNoticeKey({ code: 'lamp_limit', ritualId: 'lamp' })).toBe('ritual.lampLimit');
    expect(ritualNoticeKey({ code: 'no_slot_free', ritualId: 'lamp' })).toBe('ritual.noLampPlace');
    expect(ritualNoticeKey({ code: 'no_slot_free', ritualId: 'bow' })).toBe('ritual.noCushion');
    expect(ritualNoticeKey({ code: 'no_slot_free', ritualId: null })).toBe('ritual.noCushion');
  });
});
