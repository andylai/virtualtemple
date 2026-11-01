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
  'status.connecting': 'Joining the hall…',
  'status.reconnecting': 'Connection lost. Reconnecting…',
  'status.hallFull': 'This hall is full right now.',
  'status.allHallsFull': 'All halls are full right now. Please try again in a few minutes.',
  'status.placed': 'Hall {from} was full, so we placed you in Hall {to}.',
  'status.away': 'You were away. Press Enter to return.',
  'status.replaced': 'You opened the hall in another tab, so this one was closed.',
  'status.disconnected': 'You were disconnected from the hall.',
  'button.tryAgain': 'Try again',
  'ritual.greet': 'Greet',
  'ritual.bow': 'Bow',
  'ritual.lamp': 'Light a lamp',
  'ritual.stop': 'Stop',
  'ritual.noCushion': 'No free cushion right now.',
  'ritual.noLampPlace': 'No free place for a lamp right now.',
  'ritual.lampLimit': 'You already have a lamp lit.',
  'toast.greet': '{name} greeted with palms together',
  'toast.bow': '{name} is bowing',
  'toast.lamp': '{name} lit a lamp',
  'hall.change': 'Change hall',
  'hall.loading': 'Loading halls…',
  'hall.listError': 'Could not load the halls. Please try again.',
  'hall.entry.empty': 'Hall {n} · empty',
  'hall.entry.one': 'Hall {n} · 1 person',
  'hall.entry.other': 'Hall {n} · {count} people',
  'hall.entry.full': 'Hall {n} · full',
  'hall.entry.here': 'Hall {n} · you are here',
  'invite.button': 'Invite a friend',
  'invite.copied': 'Link copied',
  'invite.failed': 'Could not copy the link. Copy the address from your browser instead.',
  'button.close': 'Close',
  'hud.hall': 'Hall {n}',
  'hud.people.one': '1 person here',
  'hud.people.other': '{count} people here',
  'hud.you': 'You are {name}',
  'error.webgl':
    'This browser cannot show the 3D hall. Please try a recent version of Chrome, Safari or Firefox.',
} as const satisfies Record<string, string>;

/** Every message key the app can ask for. */
export type MessageKey = keyof typeof en;

/** A complete set of translations: one string for every key. */
export type Catalog = Record<MessageKey, string>;
