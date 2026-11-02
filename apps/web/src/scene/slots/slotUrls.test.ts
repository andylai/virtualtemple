import { flagshipManifest } from '@temple/shared/flagship';
import { describe, expect, it } from 'vitest';
import { resolveSlotUrls } from './slotUrls';

describe('resolveSlotUrls', () => {
  it('uses the placeholder (null) everywhere the manifest names nothing', () => {
    expect(resolveSlotUrls(flagshipManifest, '/')).toEqual({
      hallModel: null,
      statue: null,
      altarBackdrop: null,
      banner: null,
      plaque: null,
      avatar: null,
    });
  });

  it('turns manifest paths into addresses under the asset base, with no code change', () => {
    const manifest = {
      ...flagshipManifest,
      hall: {
        ...flagshipManifest.hall,
        slots: { ...flagshipManifest.hall.slots, statue: 'models/statue.glb' },
      },
      avatar: { model: 'models/person.glb' },
    };
    const urls = resolveSlotUrls(manifest, 'https://cdn.example.org/t/');
    expect(urls.statue).toBe('https://cdn.example.org/t/models/statue.glb');
    expect(urls.avatar).toBe('https://cdn.example.org/t/models/person.glb');
    expect(urls.hallModel).toBeNull();
  });
});
