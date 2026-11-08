import type { RitualId } from '@temple/shared';

/** Simple line silhouettes stay legible in the dock while the labels carry the meaning. */
const PATHS = {
  greet:
    'M12 21v-9l-2-6a1 1 0 0 0-2 .3l.7 6.7L6 11a1 1 0 0 0-1.5 1.3L9 19v2m3 0v-9l2-6a1 1 0 0 1 2 .3l-.7 6.7L18 11a1 1 0 0 1 1.5 1.3L15 19v2',
  bow: 'M18 6a2 2 0 1 0 0 .01M6 20l2-7 4-5 3 3 4 2M8 13l3 2v5',
  lamp: 'M12 22a6 6 0 0 0 6-6c0-3-2-5-3-6 0 3-2 3-2 3 0-5-2-7-4-9 1 5-3 7-3 12a6 6 0 0 0 6 6Z',
  sit: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-2 3-3 5H4m10-5 3 5h3m-11 2-4 2h14l-4-2m-5-7h4l1 6H9z',
  chant: 'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zm0 0v14',
  stop: 'M7 7h10v10H7z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  hall: 'M4 21h16M6 21V5h12v16M10 21v-9h4v9M3 5l9-3 9 3',
  invite:
    'm10 14 4-4m-5 7-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m2 2a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-2 2',
  settings: 'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4',
  about: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 11v5m0-8h.01',
  leave: 'M10 4H5v16h5m3-8h9m-4-4 4 4-4 4',
} satisfies Record<RitualId | string, string>;

/** Decorative by design, so assistive technology reads the adjacent label once. */
export function HallIcon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg
      className="hall-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
