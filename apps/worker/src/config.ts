import { loadConfig, type TempleConfig } from '@temple/shared';

const cache = new WeakMap<object, TempleConfig>();

/**
 * Returns the validated configuration for a Worker environment. The result is cached per `env`
 * object, because the environment does not change while a Worker instance is alive.
 *
 * @throws {ConfigError} When an environment override is invalid.
 */
export function configFor(env: Env): TempleConfig {
  let config = cache.get(env);
  if (config === undefined) {
    config = loadConfig(env);
    cache.set(env, config);
  }
  return config;
}
