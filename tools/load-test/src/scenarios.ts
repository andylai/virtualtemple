import { DEFAULT_CONFIG, parseHallsResponse } from '@temple/shared';
import type { Options } from './args';
import { collect, type Result } from './report';
import { Tally } from './stats';
import { Visitor } from './visitor';

const MS_PER_SECOND = 1000;
/** How often the latency probe moves, in milliseconds. */
const PROBE_EVERY_MS = 2000;
/** Probe positions step through this many x values, so each is distinct within a few seconds. */
const PROBE_POSITIONS = 900;
const PROBE_STEP_METRES = 0.01;
const PROBE_BASE_X = -5;
/** Two positions closer than this are the same probe. */
const PROBE_TOLERANCE = 0.0005;
const PROBE_Z = 7;
/** A hall sees about one quick ritual this often, to include ritual traffic. */
const RITUAL_EVERY_MS = 20_000;
/** The quick rituals a scripted visitor performs. */
const QUICK_RITUALS = ['greet', 'bow', 'lamp'] as const;
/** Time to let closes finish before counting them. */
const SETTLE_MS = 500;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The numbers a scenario gathers while it runs, handed to `finish`. */
interface Gathered {
  seconds: number;
  moveLatencies: number[];
  perHall: Record<string, number>;
  notes: Record<string, unknown>;
}

/** Joins one visitor to a hall; how it went is added to `tally`. */
async function joinOne(options: Options, hall: number, tally: Tally): Promise<Visitor | null> {
  const visitor = new Visitor(options.target, options.origin);
  const outcome = await visitor.join(hall);
  if (outcome.kind === 'welcome') {
    tally.add('welcomed');
    return visitor;
  }
  tally.add(outcome.kind === 'refused' ? `refused_${outcome.code}` : `failed_${outcome.reason}`);
  visitor.close();
  return null;
}

/** Sends a position that nobody else uses and times how long another visitor takes to see it. */
function startProbe(prober: Visitor, observer: Visitor, latencies: number[]): () => void {
  const sentAt = new Map<number, number>();
  let sequence = 0;
  const proberId = prober.welcome?.playerId;
  observer.onSnapshotMove = (move, atMs) => {
    if (move.playerId !== proberId) {
      return;
    }
    for (const [x, at] of sentAt) {
      if (Math.abs(move.x - x) < PROBE_TOLERANCE) {
        latencies.push(atMs - at);
        sentAt.delete(x);
      }
    }
  };
  const timer = setInterval(() => {
    const x = PROBE_BASE_X + (sequence % PROBE_POSITIONS) * PROBE_STEP_METRES;
    sequence += 1;
    sentAt.set(x, Date.now());
    prober.moveTo(x, PROBE_Z);
  }, PROBE_EVERY_MS);
  return () => clearInterval(timer);
}

/** Has a random visitor of the group start a quick ritual now and then, as people do. */
function startRituals(group: readonly Visitor[]): () => void {
  const timer = setInterval(
    () => {
      const visitor = group[Math.floor(Math.random() * group.length)];
      const ritualId = QUICK_RITUALS[Math.floor(Math.random() * QUICK_RITUALS.length)];
      visitor?.send({ type: 'ritual_start', ritualId });
    },
    RITUAL_EVERY_MS / Math.max(1, group.length),
  );
  return () => clearInterval(timer);
}

/** Joins `count` visitors to one hall, spread over the options' spread time. */
async function fillHall(options: Options, hall: number, count: number, tally: Tally) {
  const gap = count > 1 ? options.spreadMs / count : 0;
  const joined = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      await sleep(index * gap);
      return joinOne(options, hall, tally);
    }),
  );
  return joined.filter((visitor): visitor is Visitor => visitor !== null);
}

/** Turns what a scenario gathered into its result. */
function finish(
  options: Options,
  started: number,
  tally: Tally,
  visitors: readonly Visitor[],
  gathered: Gathered,
): Result {
  const counts = Object.entries(tally.toObject());
  const sumOf = (prefix: string) =>
    counts.filter(([name]) => name.startsWith(prefix)).reduce((total, [, n]) => total + n, 0);
  const welcomed = sumOf('welcomed');
  const refused = sumOf('refused_');
  const failed = sumOf('failed_');
  return {
    scenario: options.scenario,
    target: options.target,
    startedAt: new Date(started).toISOString(),
    ...collect(visitors, gathered),
    seconds: (Date.now() - started) / MS_PER_SECOND,
    joins: { attempted: welcomed + refused + failed, welcomed, refused, failed },
    failures: Object.fromEntries(counts.filter(([name]) => name !== 'welcomed')),
    perHall: gathered.perHall,
    notes: gathered.notes,
  };
}

/** Keeps the visitors connected (pinging, as a visible page does) for the run's duration. Returns the seconds held. */
async function holdFor(options: Options, visitors: readonly Visitor[]): Promise<number> {
  const pings = visitors.map((visitor) => visitor.startPinging());
  const holdStart = Date.now();
  await sleep(options.durationSec * MS_PER_SECOND);
  const heldSeconds = (Date.now() - holdStart) / MS_PER_SECOND;
  pings.forEach((timer) => clearInterval(timer));
  return heldSeconds;
}

/**
 * Fills `hallsToFill` halls with people who walk about for the duration, with a probe pair in each
 * hall measuring how long a move takes to reach another visitor. `hall` fills one hall; `halls` several.
 */
async function runHalls(options: Options, hallsToFill: number): Promise<Result> {
  const started = Date.now();
  const tally = new Tally();
  const halls = Array.from({ length: hallsToFill }, (_, index) => options.firstHall + index);
  const groups = await Promise.all(
    halls.map((hall) => fillHall(options, hall, options.clients, tally)),
  );
  const latencies: number[] = [];
  const stops: (() => void)[] = [];
  for (const group of groups) {
    const [prober, observer] = [group[0], group[1]];
    group.slice(2).forEach((visitor) => visitor.startWalking());
    if (prober !== undefined && observer !== undefined) {
      stops.push(startProbe(prober, observer, latencies));
    }
    stops.push(startRituals(group));
  }
  const visitors = groups.flat();
  const seconds = await holdFor(options, visitors);
  stops.forEach((stop) => stop());
  const stillConnected = visitors.filter((visitor) => visitor.connected).length;
  visitors.forEach((visitor) => visitor.close());
  await sleep(SETTLE_MS);
  const perHall = Object.fromEntries(
    halls.map((hall, i) => [`hall_${hall}`, groups[i]?.length ?? 0]),
  );
  return finish(options, started, tally, visitors, {
    seconds,
    moveLatencies: latencies,
    perHall,
    notes: { stillConnectedAtEnd: stillConnected },
  });
}

function firstUntried(tried: ReadonlySet<number>): number {
  for (let hall = 1; hall <= DEFAULT_CONFIG.hall.count; hall += 1) {
    if (!tried.has(hall)) {
      return hall;
    }
  }
  return 1;
}

/** What the browser does to join (spec 5.5): ask for the halls list, try the suggested hall, follow hints. */
async function joinLikeBrowser(
  options: Options,
  tries: number[],
  tally: Tally,
): Promise<Visitor | null> {
  const listing = await fetch(`${options.target}/api/halls`, {
    headers: { Origin: options.origin },
  })
    .then(async (response) => (response.ok ? parseHallsResponse(await response.json()) : null))
    .catch(() => null);
  let hall = listing?.suggestedHall ?? 1;
  const triedHalls = new Set<number>();
  for (let attempt = 1; attempt <= options.joinRetries; attempt += 1) {
    triedHalls.add(hall);
    const visitor = new Visitor(options.target, options.origin);
    const outcome = await visitor.join(hall);
    if (outcome.kind === 'welcome') {
      tries.push(attempt);
      tally.add('welcomed');
      return visitor;
    }
    visitor.close();
    if (outcome.kind === 'refused' && outcome.code === 'all_halls_full') {
      tally.add('refused_all_halls_full');
      return null;
    }
    const hint = outcome.kind === 'refused' ? outcome.nextHall : null;
    hall = hint !== null && !triedHalls.has(hint) ? hint : firstUntried(triedHalls);
  }
  tally.add('failed_out_of_tries');
  return null;
}

/** Many visitors arrive at once, each joining the way the browser does. */
async function runStampede(options: Options): Promise<Result> {
  const started = Date.now();
  const tally = new Tally();
  const tries: number[] = [];
  const gap = options.clients > 1 ? options.spreadMs / options.clients : 0;
  const attempts = await Promise.all(
    Array.from({ length: options.clients }, async (_, index) => {
      await sleep(index * gap);
      return joinLikeBrowser(options, tries, tally);
    }),
  );
  const placed = attempts.filter((visitor): visitor is Visitor => visitor !== null);
  const perHall: Record<string, number> = {};
  for (const visitor of placed) {
    const key = `hall_${visitor.welcome?.hall ?? 0}`;
    perHall[key] = (perHall[key] ?? 0) + 1;
  }
  const seconds = await holdFor(options, placed);
  placed.forEach((visitor) => visitor.close());
  await sleep(SETTLE_MS);
  const tryCounts = new Tally();
  tries.forEach((count) => tryCounts.add(`${count}_tries`));
  return finish(options, started, tally, placed, {
    seconds,
    moveLatencies: [],
    perHall,
    notes: { triesToBePlaced: tryCounts.toObject() },
  });
}

/** Runs the scenario the command line asked for. */
export function runScenario(options: Options): Promise<Result> {
  switch (options.scenario) {
    case 'hall':
      return runHalls(options, 1);
    case 'halls':
      return runHalls(options, options.halls);
    case 'stampede':
      return runStampede(options);
  }
}
