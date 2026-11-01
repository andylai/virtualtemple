import { useEffect, useState, useSyncExternalStore } from 'react';
import { effectiveReduceMotion, preferencesStore, type Preferences } from './preferences';

/** The visitor's remembered preferences, kept up to date. */
export function usePreferences(): Preferences {
  const store = preferencesStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

const QUERY = '(prefers-reduced-motion: reduce)';

/** Whether the device asks for less motion. */
export function useDeviceReducesMotion(): boolean {
  const [reduces, setReduces] = useState(() => window.matchMedia?.(QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(QUERY);
    if (query === undefined) {
      return undefined;
    }
    const listener = () => setReduces(query.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return reduces;
}

/** Whether to reduce motion: the visitor's choice, or else the device's (FR-36). */
export function useReducedMotion(): boolean {
  return effectiveReduceMotion(usePreferences(), useDeviceReducesMotion());
}
