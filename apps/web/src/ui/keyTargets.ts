/** Keys that press a focused button or link. */
const ACTIVATION_CODES: readonly string[] = ['Space', 'Enter', 'NumpadEnter'];

/** The part of an element this file needs, so tests can use a stand-in. */
interface MaybeElement {
  closest?: (selector: string) => unknown;
}

/**
 * Tells whether a key press is meant for the control that has focus, so the hall must not also act
 * on it. Arrow keys on a volume slider must not walk the avatar, and Space on a focused button must
 * press that button instead of starting a bow (M7-5).
 *
 * @param target - The element the key press went to.
 * @param code - The key, as a `KeyboardEvent.code` value.
 */
export function keyIsForControl(target: EventTarget | null, code: string): boolean {
  const element = target as MaybeElement | null;
  if (element === null || typeof element.closest !== 'function') {
    return false;
  }
  if (element.closest('[role="dialog"], input, textarea, select') !== null) {
    return true;
  }
  return ACTIVATION_CODES.includes(code) && element.closest('button, a[href]') !== null;
}
