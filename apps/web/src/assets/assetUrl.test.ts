import { describe, expect, it } from 'vitest';
import { assetBase, assetUrl } from './assetUrl';

describe('assetBase', () => {
  it('uses the app address when nothing is configured', () => {
    expect(assetBase(undefined, '/')).toBe('/');
    expect(assetBase(undefined, '/temple')).toBe('/temple/');
  });

  it('accepts a path on this site or a secure address and makes sure it ends with a slash', () => {
    expect(assetBase('/assets', '/')).toBe('/assets/');
    expect(assetBase('https://cdn.example.org/temple', '/')).toBe(
      'https://cdn.example.org/temple/',
    );
    expect(assetBase('https://cdn.example.org/', '/')).toBe('https://cdn.example.org/');
  });

  it.each(['http://cdn.example.org/', 'javascript:alert(1)', '//cdn.example.org/', 'cdn', ''])(
    'ignores an unsafe or malformed setting: %s',
    (setting) => {
      expect(assetBase(setting, '/')).toBe('/');
    },
  );
});

describe('assetUrl', () => {
  it('puts the manifest path after the base', () => {
    expect(assetUrl('audio/bell.opus', '/')).toBe('/audio/bell.opus');
    expect(assetUrl('models/hall.glb', 'https://cdn.example.org/t/')).toBe(
      'https://cdn.example.org/t/models/hall.glb',
    );
  });
});
