import { writeFile } from 'node:fs/promises';
import { UsageError, parseArgs } from './args';
import { formatResult } from './report';
import { runScenario } from './scenarios';

/** Runs one load-test scenario and prints its summary. Exit code 1 when anything could not join. */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `Starting ${options.scenario}: ${options.clients} visitors per ${options.scenario === 'halls' ? `${options.halls} halls` : 'group'}, ${options.durationSec} s`,
  );
  const result = await runScenario(options);
  console.log(formatResult(result));
  if (options.out !== null) {
    await writeFile(options.out, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Wrote ${options.out}`);
  }
  process.exitCode = result.joins.failed > 0 ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof UsageError ? error.message : error);
  process.exitCode = 2;
});
