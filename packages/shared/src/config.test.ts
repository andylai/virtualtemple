import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, loadConfig } from './config';

describe('loadConfig', () => {
  it('returns the defaults when nothing is overridden', () => {
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
    expect(loadConfig({ UNRELATED: 'x' })).toEqual(DEFAULT_CONFIG);
  });

  it('applies numeric and list overrides', () => {
    const config = loadConfig({ HALL_MAX_PLAYERS: '2', MEDITATION_OPTIONS: '3, 7' });
    expect(config.hall.maxPlayers).toBe(2);
    expect(config.meditation.options).toEqual([3, 7]);
    expect(config.hall.count).toBe(DEFAULT_CONFIG.hall.count);
  });

  it('ignores blank and non-string values', () => {
    expect(loadConfig({ HALL_MAX_PLAYERS: '  ', HALL_COUNT: 7 })).toEqual(DEFAULT_CONFIG);
  });

  it.each([
    ['not a number', { HALL_MAX_PLAYERS: 'many' }],
    ['zero', { HALL_MAX_PLAYERS: '0' }],
    ['a fraction where a whole number is needed', { HALL_COUNT: '2.5' }],
    ['a list with a bad entry', { MEDITATION_OPTIONS: '5,x' }],
    ['spread larger than the hall count', { HALL_COUNT: '2', HALL_SUGGEST_SPREAD: '3' }],
  ])('rejects %s', (_label, source) => {
    expect(() => loadConfig(source)).toThrow(ConfigError);
  });

  it('does not let one call change the defaults', () => {
    loadConfig({ HALL_MAX_PLAYERS: '2' });
    expect(DEFAULT_CONFIG.hall.maxPlayers).toBe(50);
  });
});
