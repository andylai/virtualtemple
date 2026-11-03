import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkStructure, findPlaceholders, readWranglerConfig } from './checkConfig';

const real = () =>
  readWranglerConfig(
    readFileSync(join(import.meta.dirname, '..', '..', '..', 'apps/worker/wrangler.jsonc'), 'utf8'),
  );

describe('the repository wrangler.jsonc', () => {
  it('is structurally sound for staging and production', () => {
    expect(checkStructure(real())).toEqual([]);
  });
});

describe('findPlaceholders', () => {
  // The repository file gets real addresses over time, so the check is tried on a copy that has none.
  const withPlaceholders = () => {
    const config = real();
    config.env!.staging!.vars!.ALLOWED_ORIGINS =
      'https://virtual-temple-staging.CHANGE-ME.workers.dev';
    config.env!.production!.vars!.ALLOWED_ORIGINS = 'https://CHANGE-ME-DOMAIN';
    return config;
  };

  it('refuses an environment that still holds the placeholder', () => {
    expect(findPlaceholders(withPlaceholders(), 'staging')).toHaveLength(1);
    expect(findPlaceholders(withPlaceholders(), 'production')).toHaveLength(1);
  });

  it('judges each environment on its own values', () => {
    const config = withPlaceholders();
    config.env!.staging!.vars!.ALLOWED_ORIGINS = 'https://staging.example.org';
    expect(findPlaceholders(config, 'staging')).toEqual([]);
    expect(findPlaceholders(config, 'production')).toHaveLength(1);
  });
});

describe('checkStructure', () => {
  const broken = (change: (config: ReturnType<typeof real>) => void) => {
    const config = real();
    change(config);
    return checkStructure(config);
  };

  it('catches a binding or migration missing from an environment', () => {
    expect(
      broken((c) => {
        c.env!.staging!.durable_objects!.bindings!.pop();
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining('staging: Durable Object bindings differ')]),
    );
    expect(
      broken((c) => {
        c.env!.production!.migrations = [];
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('production: migrations differ')]));
  });

  it('catches an origin that is not https, or is local', () => {
    expect(
      broken((c) => {
        c.env!.production!.vars!.ALLOWED_ORIGINS = 'http://temple.example.org';
      }),
    ).not.toEqual([]);
    expect(
      broken((c) => {
        c.env!.production!.vars!.ALLOWED_ORIGINS = 'https://localhost';
      }),
    ).not.toEqual([]);
    expect(
      broken((c) => {
        c.env!.production!.vars!.ALLOWED_ORIGINS = 'https://temple.example.org/';
      }),
    ).not.toEqual([]);
  });

  it('catches a missing limiter, a shared namespace and a bad period', () => {
    expect(
      broken((c) => {
        c.env!.staging!.ratelimits!.pop();
      }),
    ).not.toEqual([]);
    expect(
      broken((c) => {
        c.env!.staging!.ratelimits![0]!.namespace_id = '1001';
      }),
    ).not.toEqual([]);
    expect(
      broken((c) => {
        c.env!.staging!.ratelimits![0]!.simple!.period = 30;
      }),
    ).not.toEqual([]);
  });

  it('catches a site that does not route the Worker paths, and logs left off', () => {
    expect(
      broken((c) => {
        c.env!.production!.assets!.run_worker_first = ['/ws'];
      }),
    ).not.toEqual([]);
    expect(
      broken((c) => {
        c.env!.production!.observability!.enabled = false;
      }),
    ).not.toEqual([]);
  });

  it('requires production to be reachable only on its own domain', () => {
    expect(
      broken((c) => {
        c.env!.production!.workers_dev = true;
      }),
    ).not.toEqual([]);
  });
});
