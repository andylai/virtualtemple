import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEPLOY_ENVIRONMENTS,
  PLACEHOLDER,
  checkStructure,
  findPlaceholders,
  readWranglerConfig,
  type DeployEnvironment,
} from './checkConfig';

const root = join(import.meta.dirname, '..', '..', '..');
const environment = process.argv[2] as DeployEnvironment | undefined;

/**
 * The combined terms and privacy pages need review before a public launch (plan M8-6).
 */
function checkLegalPages(target: DeployEnvironment): string[] {
  const problems: string[] = [];
  for (const file of ['terms.html', 'terms-zh.html']) {
    const path = join(root, 'apps/web/dist', file);
    const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (text === '') {
      problems.push(`apps/web/dist/${file} is missing`);
    } else if (target === 'production' && text.includes('data-status="draft"')) {
      problems.push(
        `apps/web/public/${file} is still a draft: finish the legal review, then remove its draft notice`,
      );
    } else if (target === 'production' && text.includes(PLACEHOLDER)) {
      problems.push(`apps/web/public/${file} still has ${PLACEHOLDER}: add the contact address`);
    }
  }
  return problems;
}

/** Refuses to continue when the Worker's configuration is not ready to deploy to an environment. */
function main(): void {
  if (environment === undefined || !DEPLOY_ENVIRONMENTS.includes(environment)) {
    console.error(`Usage: pnpm deploy:check <${DEPLOY_ENVIRONMENTS.join('|')}>`);
    process.exit(2);
  }
  const config = readWranglerConfig(readFileSync(join(root, 'apps/worker/wrangler.jsonc'), 'utf8'));
  const problems = [...checkStructure(config), ...findPlaceholders(config, environment)];
  for (const file of ['index.html', '_headers']) {
    if (!existsSync(join(root, 'apps/web/dist', file))) {
      problems.push(`apps/web/dist/${file} is missing: run pnpm build first`);
    }
  }
  problems.push(...checkLegalPages(environment));
  if (problems.length > 0) {
    console.error(`Not ready to deploy to ${environment}:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`Deploy configuration for ${environment} is ready.`);
}

main();
