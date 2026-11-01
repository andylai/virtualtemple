import raw from '../../../manifests/flagship.json';
import { parseManifest } from './manifest';

/** The launch temple's manifest, validated when the module loads so a bad file fails fast. */
export const flagshipManifest = parseManifest(raw);
