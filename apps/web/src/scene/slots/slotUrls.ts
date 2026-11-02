import type { TempleManifest } from '@temple/shared';
import { assetUrl } from '../../assets/assetUrl';

/** The address of each replaceable part of the temple, or null where the placeholder is used. */
export interface SlotUrls {
  hallModel: string | null;
  statue: string | null;
  altarBackdrop: string | null;
  banner: string | null;
  plaque: string | null;
  avatar: string | null;
}

const orNull = (path: string | null, base: string): string | null =>
  path === null ? null : assetUrl(path, base);

/**
 * Works out where each model and picture of the temple is from the manifest. Swapping art is a
 * manifest edit and nothing else (acceptance criterion 9).
 *
 * @param manifest - The temple's manifest.
 * @param base - Where assets are served from.
 */
export function resolveSlotUrls(manifest: TempleManifest, base: string): SlotUrls {
  const { slots } = manifest.hall;
  return {
    hallModel: orNull(slots.hallModel, base),
    statue: orNull(slots.statue, base),
    altarBackdrop: orNull(slots.altarBackdrop, base),
    banner: orNull(slots.banner, base),
    plaque: orNull(slots.plaque, base),
    avatar: orNull(manifest.avatar.model, base),
  };
}
