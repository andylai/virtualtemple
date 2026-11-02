import { useSyncExternalStore } from 'react';

/**
 * How much of the bottom of the screen the buttons cover, as measured by the buttons themselves.
 * The camera keeps the hall clear of it. It is 0 until the buttons are on screen, and then the
 * camera falls back to an estimate so the hall does not jump when they appear.
 */
let dockHeightPx = 0;
const listeners = new Set<() => void>();

/** Records the height of the button area in pixels (0 when it is not shown). */
export function setDockHeight(pixels: number): void {
  const rounded = Math.round(pixels);
  if (rounded !== dockHeightPx) {
    dockHeightPx = rounded;
    listeners.forEach((listener) => listener());
  }
}

/** The measured height of the button area, in pixels, as a value that re-renders when it changes. */
export function useDockHeight(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => dockHeightPx,
  );
}
