/** The scenarios the tool can run (spec section 11, plan M8-1). */
export const SCENARIOS = ['hall', 'halls', 'stampede'] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

/** What the command line asks for. Defaults match the spec's targets. */
export interface Options {
  scenario: ScenarioName;
  /** Address of the deployed temple, for example https://staging.example.org. */
  target: string;
  /** The page's address, sent as the Origin header; defaults to the target. */
  origin: string;
  /** People per hall (`hall`, `halls`) or in the stampede. */
  clients: number;
  /** Halls used by the `halls` scenario. */
  halls: number;
  /** The first hall used. */
  firstHall: number;
  /** How long people stay and move once in, in seconds. */
  durationSec: number;
  /** Joins are spread over this many milliseconds (0 = all at once). */
  spreadMs: number;
  /** Halls a visitor tries before giving up, like the browser's `hall.joinRetries`. */
  joinRetries: number;
  /** Write the full result as JSON to this file. */
  out: string | null;
}

const DEFAULTS: Omit<Options, 'target' | 'origin'> = {
  scenario: 'hall',
  clients: 50,
  halls: 5,
  firstHall: 1,
  durationSec: 60,
  spreadMs: 5000,
  joinRetries: 5,
  out: null,
};

const NUMBER_FLAGS = {
  '--clients': 'clients',
  '--halls': 'halls',
  '--first-hall': 'firstHall',
  '--duration': 'durationSec',
  '--spread-ms': 'spreadMs',
  '--join-retries': 'joinRetries',
} as const;

/** Thrown for a mistake on the command line; the message says how to fix it. */
export class UsageError extends Error {}

function readNumber(flag: string, raw: string | undefined): number {
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new UsageError(`${flag} needs a whole number, not ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Checks that an address is http(s) with nothing after the host, so the tool never aims at a path. */
function readAddress(flag: string, raw: string | undefined): string {
  try {
    const url = new URL(raw ?? '');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('scheme');
    }
    return url.origin;
  } catch {
    throw new UsageError(`${flag} needs an address such as https://staging.example.org`);
  }
}

/**
 * Reads the command line, for example `--scenario hall --target https://staging.example.org`.
 *
 * @throws {UsageError} When something is missing or wrong.
 */
export function parseArgs(argv: readonly string[]): Options {
  const options: Omit<Options, 'target' | 'origin'> & { target?: string; origin?: string } = {
    ...DEFAULTS,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] ?? '';
    const value = argv[index + 1];
    if (flag === '--scenario') {
      if (!SCENARIOS.includes(value as ScenarioName)) {
        throw new UsageError(`--scenario must be one of ${SCENARIOS.join(', ')}`);
      }
      options.scenario = value as ScenarioName;
    } else if (flag === '--target' || flag === '--origin') {
      options[flag === '--target' ? 'target' : 'origin'] = readAddress(flag, value);
    } else if (flag === '--out') {
      options.out = value ?? null;
    } else if (flag in NUMBER_FLAGS) {
      options[NUMBER_FLAGS[flag as keyof typeof NUMBER_FLAGS]] = readNumber(flag, value);
    } else {
      throw new UsageError(`Unknown option ${flag}`);
    }
  }
  if (options.target === undefined) {
    throw new UsageError('--target is required, for example --target https://staging.example.org');
  }
  if (options.clients < 1 || options.halls < 1 || options.firstHall < 1) {
    throw new UsageError('--clients, --halls and --first-hall must be at least 1');
  }
  return { ...options, target: options.target, origin: options.origin ?? options.target };
}
