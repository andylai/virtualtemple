import { useEffect } from 'react';
import type { HallState } from '../net/hallState';
import { preferencesStore } from './preferences';

/** Remembers the visitor's nickname once the hall has given them one, so they have it next time (FR-3). */
export function useRememberNickname(state: HallState): void {
  const { status, nickname } = state;
  useEffect(() => {
    if (status !== 'joined' || nickname === null) {
      return;
    }
    const saved = preferencesStore().getState().nickname;
    if (saved?.adjectiveId !== nickname.adjectiveId || saved.nounId !== nickname.nounId) {
      preferencesStore().update({ nickname });
    }
  }, [status, nickname]);
}
