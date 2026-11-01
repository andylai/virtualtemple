import { flagshipManifest } from '@temple/shared/flagship';
import type { TempleManifest } from '@temple/shared';

const MANIFESTS: Readonly<Record<string, TempleManifest>> = {
  [flagshipManifest.slug]: flagshipManifest,
};

/**
 * Finds a temple's manifest by its slug.
 *
 * @throws {Error} When no temple has that slug, which means the Worker is misconfigured.
 */
export function manifestFor(slug: string): TempleManifest {
  const manifest = MANIFESTS[slug];
  if (manifest === undefined) {
    throw new Error(`No manifest for temple "${slug}"`);
  }
  return manifest;
}
