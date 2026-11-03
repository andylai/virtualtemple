import { SELF } from 'cloudflare:test';
import { MAX_PROBLEM_DETAIL_CHARS, MAX_PROBLEM_REPORT_BYTES } from '@temple/shared';
import { describe, expect, it, vi } from 'vitest';
import { browserFamily, withinAllowance } from '../src/edge';
import { ORIGIN } from './helpers';

const send = (body: string, headers: Record<string, string> = { Origin: ORIGIN }) =>
  SELF.fetch('http://example.com/api/report', { method: 'POST', body, headers });

describe('POST /api/report', () => {
  it('accepts a kind with a short note and answers without a body', async () => {
    const response = await send(JSON.stringify({ kind: 'crash', detail: 'TypeError: x' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await response.text()).toBe('');
  });

  it('accepts a kind alone', async () => {
    expect((await send(JSON.stringify({ kind: 'no_webgl' }))).status).toBe(204);
  });

  it('refuses a foreign or missing Origin', async () => {
    const body = JSON.stringify({ kind: 'crash' });
    expect((await send(body, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await send(body, {})).status).toBe(403);
  });

  it.each([
    ['an unknown kind', JSON.stringify({ kind: 'anything' })],
    ['an extra field', JSON.stringify({ kind: 'crash', userId: 'abc' })],
    [
      'a long note',
      JSON.stringify({ kind: 'crash', detail: 'x'.repeat(MAX_PROBLEM_DETAIL_CHARS + 1) }),
    ],
    ['text that is not JSON', 'not json'],
    ['a list', '[]'],
  ])('refuses %s', async (_name, body) => {
    expect((await send(body)).status).toBe(400);
  });

  it('refuses a body over the limit without reading it as a report', async () => {
    const body = JSON.stringify({ kind: 'crash', detail: 'x'.repeat(MAX_PROBLEM_REPORT_BYTES) });
    expect((await send(body)).status).toBe(413);
  });

  it('accepts only POST', async () => {
    const response = await SELF.fetch('http://example.com/api/report', {
      headers: { Origin: ORIGIN },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});

describe('answers the Worker writes itself', () => {
  it('are not sniffed or cached', async () => {
    const response = await SELF.fetch('http://example.com/nothing-here');
    expect(response.status).toBe(404);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('withinAllowance', () => {
  const request = new Request('http://example.com/', {
    headers: { 'CF-Connecting-IP': '203.0.113.7' },
  });

  it('allows everything when there is no limiter', async () => {
    expect(await withinAllowance(undefined, request)).toBe(true);
  });

  it('asks the limiter with the browser address as the key', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    expect(await withinAllowance({ limit }, request)).toBe(false);
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
  });

  it('lets a visitor through when the limiter itself fails', async () => {
    const limit = vi.fn().mockRejectedValue(new Error('down'));
    expect(await withinAllowance({ limit }, request)).toBe(true);
  });
});

describe('browserFamily', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'safari-mobile',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
      'chrome-mobile',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      'chrome-desktop',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'firefox-desktop'],
    [
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'edge-desktop',
    ],
    [null, 'other-desktop'],
  ])('describes %s coarsely', (agent, expected) => {
    expect(browserFamily(agent)).toBe(expected);
  });
});
