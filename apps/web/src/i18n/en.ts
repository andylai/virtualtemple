/**
 * English text, and the list of message keys every other language must provide.
 *
 * Keys are grouped by screen. `{name}` marks a value filled in at run time.
 */
export const en = {
  'app.title': 'Virtual Temple',
  'loading.preparing': 'Preparing the hall…',
  'loading.progress': 'Loading {percent}%',
  'enter.button': 'Enter',
  'enter.hint': 'Sound will start when you enter.',
  'error.webgl':
    'This browser cannot show the 3D hall. Please try a recent version of Chrome, Safari or Firefox.',
} as const satisfies Record<string, string>;

/** Every message key the app can ask for. */
export type MessageKey = keyof typeof en;

/** A complete set of translations: one string for every key. */
export type Catalog = Record<MessageKey, string>;
