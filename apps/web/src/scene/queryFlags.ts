/** The most stand-in avatars the performance test may draw, so a typo cannot freeze a phone. */
export const STRESS_MAX = 200;

/** Developer switches read from the page address, for example `?debug=1&stress=50`. */
export interface DebugFlags {
  /** Shows the frame-rate overlay. */
  debug: boolean;
  /** How many stand-in avatars to draw for the performance test; 0 draws none. */
  stress: number;
}

/**
 * Reads the developer switches from a URL query string.
 *
 * @param search - `window.location.search`.
 */
export function readDebugFlags(search: string): DebugFlags {
  const params = new URLSearchParams(search);
  const stressRaw = params.get('stress');
  const stress = stressRaw !== null && /^[0-9]+$/.test(stressRaw) ? Number(stressRaw) : 0;
  return { debug: params.get('debug') === '1', stress: Math.min(stress, STRESS_MAX) };
}
