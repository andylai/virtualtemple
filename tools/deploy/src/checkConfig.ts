import { parse, type ParseError } from 'jsonc-parser';

/** The environments that are deployed. The top-level configuration is for local development only. */
export const DEPLOY_ENVIRONMENTS = ['staging', 'production'] as const;
export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

/** Rate limiters the Worker looks for by name (apps/worker/src/edge.ts). */
export const REQUIRED_LIMITERS = ['CONNECT_LIMITER', 'HALLS_LIMITER', 'REPORT_LIMITER'] as const;
/** Paths the Worker must answer itself instead of the static site. */
export const REQUIRED_WORKER_PATHS = ['/ws', '/api/*', '/health'] as const;
/** A value in the configuration that must be replaced before deploying. */
export const PLACEHOLDER = 'CHANGE-ME';

interface Binding {
  name?: string;
  class_name?: string;
}
interface Limiter {
  name?: string;
  namespace_id?: string;
  simple?: { limit?: number; period?: number };
}
interface EnvConfig {
  name?: string;
  vars?: Record<string, string>;
  durable_objects?: { bindings?: Binding[] };
  migrations?: unknown;
  assets?: {
    directory?: string;
    run_worker_first?: string[] | boolean;
    not_found_handling?: string;
  };
  observability?: { enabled?: boolean };
  ratelimits?: Limiter[];
  routes?: { pattern?: string }[];
  workers_dev?: boolean;
}
interface WranglerConfig extends EnvConfig {
  env?: Record<string, EnvConfig>;
}

/** Reads `wrangler.jsonc` text, which allows comments and trailing commas. */
export function readWranglerConfig(text: string): WranglerConfig {
  const errors: ParseError[] = [];
  const config = parse(text, errors, { allowTrailingComma: true }) as WranglerConfig | undefined;
  if (errors.length > 0 || config === undefined) {
    throw new Error('wrangler.jsonc could not be read');
  }
  return config;
}

const bindingNames = (config: EnvConfig) =>
  (config.durable_objects?.bindings ?? [])
    .map((binding) => `${binding.name}:${binding.class_name}`)
    .sort();

function checkInheritance(base: WranglerConfig, env: EnvConfig, label: string): string[] {
  const problems: string[] = [];
  if (JSON.stringify(bindingNames(env)) !== JSON.stringify(bindingNames(base))) {
    problems.push(`${label}: Durable Object bindings differ from the top-level ones`);
  }
  if (JSON.stringify(env.migrations) !== JSON.stringify(base.migrations)) {
    problems.push(`${label}: migrations differ from the top-level ones`);
  }
  if (env.vars?.TEMPLE_SLUG !== base.vars?.TEMPLE_SLUG) {
    problems.push(`${label}: TEMPLE_SLUG differs from the top-level one`);
  }
  return problems;
}

function checkOrigins(env: EnvConfig, label: string): string[] {
  const origins = (env.vars?.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim());
  const problems: string[] = [];
  if (origins.length === 0 || origins.some((origin) => origin === '')) {
    problems.push(`${label}: ALLOWED_ORIGINS is empty`);
  }
  for (const origin of origins.filter((value) => value !== '')) {
    if (
      !origin.startsWith('https://') ||
      /localhost|127\.0\.0\.1/.test(origin) ||
      /[/?#]$/.test(origin)
    ) {
      problems.push(
        `${label}: ALLOWED_ORIGINS must be https origins without a path or localhost (${origin})`,
      );
    }
  }
  return problems;
}

function checkLimiters(env: EnvConfig, label: string): string[] {
  const problems: string[] = [];
  const names = (env.ratelimits ?? []).map((limiter) => limiter.name);
  for (const required of REQUIRED_LIMITERS) {
    if (!names.includes(required)) {
      problems.push(`${label}: rate limiter ${required} is missing`);
    }
  }
  for (const limiter of env.ratelimits ?? []) {
    const { limit, period } = limiter.simple ?? {};
    if (limit === undefined || limit < 1 || (period !== 10 && period !== 60)) {
      problems.push(`${label}: ${limiter.name} needs a limit and a period of 10 or 60 seconds`);
    }
  }
  return problems;
}

function checkSite(env: EnvConfig, label: string): string[] {
  const problems: string[] = [];
  const first = env.assets?.run_worker_first;
  if (env.assets?.directory !== '../web/dist') {
    problems.push(`${label}: assets.directory must be ../web/dist`);
  }
  if (!Array.isArray(first) || REQUIRED_WORKER_PATHS.some((path) => !first.includes(path))) {
    problems.push(
      `${label}: assets.run_worker_first must list ${REQUIRED_WORKER_PATHS.join(', ')}`,
    );
  }
  if (env.observability?.enabled !== true) {
    problems.push(`${label}: observability must be enabled`);
  }
  return problems;
}

/**
 * Checks the structure of the deploy configuration: that each environment repeats what wrangler
 * does not inherit, allows only https origins, has its rate limiters and serves the site.
 *
 * @returns One message per problem; empty when the configuration is sound.
 */
export function checkStructure(config: WranglerConfig): string[] {
  const problems: string[] = [];
  const namespaces = new Set<string>();
  for (const name of DEPLOY_ENVIRONMENTS) {
    const env = config.env?.[name];
    if (env === undefined) {
      problems.push(`${name}: environment is missing`);
      continue;
    }
    problems.push(
      ...checkInheritance(config, env, name),
      ...checkOrigins(env, name),
      ...checkLimiters(env, name),
      ...checkSite(env, name),
    );
    for (const limiter of env.ratelimits ?? []) {
      if (limiter.namespace_id !== undefined && namespaces.has(limiter.namespace_id)) {
        problems.push(
          `${name}: rate limiter namespace_id ${limiter.namespace_id} is also used elsewhere`,
        );
      }
      namespaces.add(limiter.namespace_id ?? '');
    }
  }
  if (config.env?.production?.workers_dev !== false) {
    problems.push(
      'production: workers_dev must be false so the Worker is reachable only on its own domain',
    );
  }
  return problems;
}

/** Lists every value of one environment that still holds the placeholder and so cannot be deployed. */
export function findPlaceholders(config: WranglerConfig, environment: DeployEnvironment): string[] {
  const text = JSON.stringify(config.env?.[environment] ?? {});
  return text.includes(PLACEHOLDER)
    ? [`${environment}: replace every ${PLACEHOLDER} value in wrangler.jsonc (domain and origins)`]
    : [];
}
