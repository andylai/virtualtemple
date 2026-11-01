import { DEFAULT_CONFIG, ritualForKey, type RitualId } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { useEffect, useRef } from 'react';

/**
 * Starts a ritual when its key is pressed (3, 1/E/Space, 2, L). A key held down does not repeat,
 * and a press inside the cooldown is ignored here so the hall is not asked needlessly.
 *
 * @param enabled - Whether the visitor is in a hall.
 * @param onStart - Asks the hall to start the ritual.
 */
export function useRitualKeys(enabled: boolean, onStart: (ritualId: RitualId) => void): void {
  const lastStartMs = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const press = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      const ritualId = ritualForKey(event.code, flagshipManifest.rituals);
      if (event.repeat || typing || ritualId === null) {
        return;
      }
      event.preventDefault();
      const now = performance.now();
      if (now - lastStartMs.current >= DEFAULT_CONFIG.ritual.cooldownMs) {
        lastStartMs.current = now;
        onStart(ritualId);
      }
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, [enabled, onStart]);
}
