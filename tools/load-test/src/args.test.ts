import { describe, expect, it } from 'vitest';
import { UsageError, parseArgs } from './args';

describe('parseArgs', () => {
  it('needs a target and applies defaults', () => {
    const options = parseArgs(['--target', 'https://staging.example.org/']);
    expect(options).toMatchObject({
      scenario: 'hall',
      target: 'https://staging.example.org',
      origin: 'https://staging.example.org',
      clients: 50,
      out: null,
    });
  });

  it('reads every option', () => {
    const options = parseArgs([
      '--scenario',
      'stampede',
      '--target',
      'http://localhost:8788',
      '--origin',
      'http://localhost:5173',
      '--clients',
      '160',
      '--halls',
      '4',
      '--first-hall',
      '2',
      '--duration',
      '30',
      '--spread-ms',
      '0',
      '--join-retries',
      '5',
      '--out',
      'result.json',
    ]);
    expect(options).toMatchObject({
      scenario: 'stampede',
      clients: 160,
      halls: 4,
      firstHall: 2,
      durationSec: 30,
      spreadMs: 0,
      joinRetries: 5,
      out: 'result.json',
      origin: 'http://localhost:5173',
    });
  });

  it.each([
    [[]],
    [['--target', 'not a url']],
    [['--target', 'ftp://x.example']],
    [['--target', 'https://x.example', '--scenario', 'nope']],
    [['--target', 'https://x.example', '--clients', '0']],
    [['--target', 'https://x.example', '--clients', '1.5']],
    [['--target', 'https://x.example', '--clients']],
    [['--target', 'https://x.example', '--surprise', '1']],
  ])('refuses %j', (argv) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
  });
});
