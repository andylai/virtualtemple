import { abortAllDurableObjects } from 'cloudflare:test';
import { afterEach } from 'vitest';

afterEach(async () => {
  await abortAllDurableObjects();
});
