/** The address the app itself is served from: `/` unless the site lives in a sub-folder. */
const APP_BASE = '/';

/**
 * Only these kinds of address may serve assets: a path on this site, or a secure address elsewhere
 * (such as R2). A leading `//` is not a path on this site: it names another host.
 */
const ALLOWED_BASE = /^(\/(?!\/)|https:\/\/)/;

/**
 * Works out where assets (models, pictures, sounds) are served from. The setting is
 * `VITE_ASSET_BASE_URL`; with none, or one that is not safe, they come from the app's own address,
 * so assets can move to a storage bucket later by changing configuration only (spec 7).
 *
 * @param setting - The configured value, if any.
 * @param appBase - The app's own base address.
 */
export function assetBase(setting: string | undefined, appBase: string = APP_BASE): string {
  const wanted = setting !== undefined && ALLOWED_BASE.test(setting) ? setting : appBase;
  return wanted.endsWith('/') ? wanted : `${wanted}/`;
}

/**
 * The full address of an asset named in the manifest.
 *
 * @param path - The manifest's relative path, such as `audio/bell.opus`.
 * @param base - Where assets are served from, from {@link assetBase}.
 */
export function assetUrl(path: string, base: string): string {
  return `${base}${path}`;
}

/** The address assets are served from in this build. */
export const ASSET_BASE = assetBase(import.meta.env.VITE_ASSET_BASE_URL, import.meta.env.BASE_URL);
