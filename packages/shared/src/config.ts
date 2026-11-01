import { z } from 'zod';

const positiveInt = z.number().int().positive();
const positiveNumber = z.number().positive();
const fraction = z.number().min(0).max(1);

/** Every tunable number in one place (spec section 4.3). Nothing else may hard-code these. */
export const configSchema = z
  .object({
    hall: z.object({
      count: positiveInt,
      maxPlayers: positiveInt,
      joinRetries: positiveInt,
      reportIntervalSec: positiveInt,
      heartbeatSec: positiveInt,
      suggestSpread: positiveInt,
      idleKickSec: positiveInt,
      reconnectGraceSec: positiveInt,
    }),
    net: z.object({
      positionSendHz: positiveNumber,
      snapshotHz: positiveNumber,
      maxMessageBytes: positiveInt,
      maxMessagesPerSecond: positiveInt,
      pingSec: positiveInt,
    }),
    ritual: z.object({ cooldownMs: positiveInt }),
    lamp: z.object({ durationSec: positiveInt, maxPerPlayer: positiveInt }),
    ui: z.object({ toastSeconds: positiveNumber, maxToasts: positiveInt }),
    meditation: z.object({ options: z.array(positiveInt).min(1) }),
    audio: z.object({
      defaultVolumes: z.object({ ambient: fraction, chanting: fraction, sfx: fraction }),
      preloadLeadSec: positiveInt,
    }),
  })
  .refine((config) => config.hall.suggestSpread <= config.hall.count, {
    path: ['hall', 'suggestSpread'],
    message: 'must not exceed hall.count',
  });

/** The validated configuration. */
export type TempleConfig = z.infer<typeof configSchema>;

/** Proposed defaults from spec section 4.3. Tune them after load testing (open question O-7). */
export const DEFAULT_CONFIG: TempleConfig = {
  hall: {
    count: 20,
    maxPlayers: 50,
    joinRetries: 5,
    reportIntervalSec: 3,
    heartbeatSec: 30,
    suggestSpread: 3,
    idleKickSec: 900,
    reconnectGraceSec: 60,
  },
  net: {
    positionSendHz: 8,
    snapshotHz: 8,
    maxMessageBytes: 1024,
    maxMessagesPerSecond: 20,
    pingSec: 30,
  },
  ritual: { cooldownMs: 1500 },
  lamp: { durationSec: 300, maxPerPlayer: 1 },
  ui: { toastSeconds: 4, maxToasts: 3 },
  meditation: { options: [5, 10, 15] },
  audio: { defaultVolumes: { ambient: 0.35, chanting: 0.26, sfx: 0.35 }, preloadLeadSec: 120 },
};

/** How an environment value is read: one number, or a comma-separated list of numbers. */
type EnvKind = 'number' | 'numberList';

interface EnvOverride {
  env: string;
  section: keyof TempleConfig;
  key: string;
  kind: EnvKind;
}

const hall = (env: string, key: string): EnvOverride => ({
  env,
  section: 'hall',
  key,
  kind: 'number',
});
const net = (env: string, key: string): EnvOverride => ({
  env,
  section: 'net',
  key,
  kind: 'number',
});

/** Environment variables that may override a default, for example `HALL_MAX_PLAYERS=2`. */
const ENV_OVERRIDES: readonly EnvOverride[] = [
  hall('HALL_COUNT', 'count'),
  hall('HALL_MAX_PLAYERS', 'maxPlayers'),
  hall('HALL_JOIN_RETRIES', 'joinRetries'),
  hall('HALL_REPORT_INTERVAL_SEC', 'reportIntervalSec'),
  hall('HALL_HEARTBEAT_SEC', 'heartbeatSec'),
  hall('HALL_SUGGEST_SPREAD', 'suggestSpread'),
  hall('HALL_IDLE_KICK_SEC', 'idleKickSec'),
  hall('HALL_RECONNECT_GRACE_SEC', 'reconnectGraceSec'),
  net('NET_POSITION_SEND_HZ', 'positionSendHz'),
  net('NET_SNAPSHOT_HZ', 'snapshotHz'),
  net('NET_MAX_MESSAGE_BYTES', 'maxMessageBytes'),
  net('NET_MAX_MESSAGES_PER_SECOND', 'maxMessagesPerSecond'),
  net('NET_PING_SEC', 'pingSec'),
  { env: 'RITUAL_COOLDOWN_MS', section: 'ritual', key: 'cooldownMs', kind: 'number' },
  { env: 'LAMP_DURATION_SEC', section: 'lamp', key: 'durationSec', kind: 'number' },
  { env: 'LAMP_MAX_PER_PLAYER', section: 'lamp', key: 'maxPerPlayer', kind: 'number' },
  { env: 'UI_TOAST_SECONDS', section: 'ui', key: 'toastSeconds', kind: 'number' },
  { env: 'UI_MAX_TOASTS', section: 'ui', key: 'maxToasts', kind: 'number' },
  { env: 'MEDITATION_OPTIONS', section: 'meditation', key: 'options', kind: 'numberList' },
  { env: 'AUDIO_PRELOAD_LEAD_SEC', section: 'audio', key: 'preloadLeadSec', kind: 'number' },
];

/** Thrown when the configuration is invalid. `issues` lists every problem found. */
export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid configuration: ${issues.join('; ')}`);
    this.name = 'ConfigError';
  }
}

function readEnvValue(raw: string, kind: EnvKind): number | number[] {
  return kind === 'number' ? Number(raw) : raw.split(',').map((part) => Number(part.trim()));
}

/**
 * Builds the configuration: the defaults, with any environment overrides applied, validated.
 *
 * @param source - An object holding environment values, for example the Worker `env`. Values that
 *   are not strings, or are blank, are ignored.
 * @throws {ConfigError} When an override is not a valid number or the result breaks a rule.
 */
export function loadConfig(source: object = {}): TempleConfig {
  const values = source as Record<string, unknown>;
  const draft = structuredClone(DEFAULT_CONFIG) as unknown as Record<
    string,
    Record<string, unknown>
  >;
  for (const { env, section, key, kind } of ENV_OVERRIDES) {
    const raw = values[env];
    if (typeof raw === 'string' && raw.trim() !== '') {
      const target = draft[section];
      if (target !== undefined) {
        target[key] = readEnvValue(raw.trim(), kind);
      }
    }
  }
  const result = configSchema.safeParse(draft);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
