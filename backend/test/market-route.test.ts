import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import { after, afterEach, before, test } from 'node:test';
import { app } from '../src/app';
import { env } from '../src/config/env';

const originalFetch = globalThis.fetch;
const originalFallbackEnabled = env.marketDataFallbackEnabled;
let server: Server;
let baseUrl = '';

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  env.marketDataFallbackEnabled = originalFallbackEnabled;
});

function governmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    state: 'Karnataka',
    district: 'Bengaluru',
    market: 'Bengaluru APMC',
    commodity: 'Tomato',
    variety: 'Local',
    arrival_date: '2026-09-23',
    min_price: '1000',
    max_price: '1500',
    modal_price: '1250',
    ...overrides,
  };
}

function governmentResponse(records: unknown[], status = 200) {
  return new Response(JSON.stringify({ records }), { status, headers: { 'content-type': 'application/json' } });
}

async function request(): Promise<{ response: { status: number; headers: Record<string, string | string[] | undefined> }; body: { records: Array<{ locationScope?: string; source?: string }>; source: string; fallback: boolean; locationScope: string } }> {
  return new Promise((resolve, reject) => {
    const clientRequest = httpRequest(`${baseUrl}/api/market/prices?state=Karnataka&district=Bengaluru&city=Bengaluru`, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve({
            response: { status: response.statusCode ?? 0, headers: response.headers },
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as { records: Array<{ locationScope?: string; source?: string }>; source: string; fallback: boolean; locationScope: string },
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    clientRequest.on('error', reject);
    clientRequest.end();
  });
}

function mockGovernmentApi(responses: Response[], requestedUrls: string[]) {
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    const response = responses.shift();
    if (!response) throw new Error('Unexpected government API request');
    return response;
  };
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

test('uses district government records without state retry', async () => {
  const requestedUrls: string[] = [];
  mockGovernmentApi([governmentResponse([governmentRecord()])], requestedUrls);

  const result = await request();

  assert.equal(result.response.status, 200);
  assert.equal(header(result.response.headers, 'x-market-data-source'), 'government');
  assert.equal(header(result.response.headers, 'x-market-data-fallback'), 'false');
  assert.equal(header(result.response.headers, 'x-market-data-location-scope'), 'district');
  assert.equal(result.body.source, 'government');
  assert.equal(result.body.fallback, false);
  assert.equal(result.body.locationScope, 'district');
  assert.equal(result.body.records[0].locationScope, 'district');
  assert.equal(new URL(requestedUrls[0]).searchParams.get('filters[district]'), 'Bengaluru');
  assert.equal(requestedUrls.length, 1);
});

test('returns JSON for unmatched market endpoints', async () => {
  const response = await fetch(`${baseUrl}/api/market/not-a-route`);

  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/i);
  assert.deepEqual(await response.json(), { error: 'Market endpoint not found' });
});

test('retries state scope when district returns empty_response', async () => {
  const requestedUrls: string[] = [];
  mockGovernmentApi([governmentResponse([]), governmentResponse([governmentRecord({ district: 'Mysuru', market: 'Mysuru APMC', commodity: 'Onion' })])], requestedUrls);

  const result = await request();

  assert.equal(result.response.status, 200);
  assert.equal(header(result.response.headers, 'x-market-data-source'), 'government');
  assert.equal(header(result.response.headers, 'x-market-data-fallback'), 'false');
  assert.equal(header(result.response.headers, 'x-market-data-location-scope'), 'state');
  assert.equal(result.body.source, 'government');
  assert.equal(result.body.fallback, false);
  assert.equal(result.body.locationScope, 'state');
  assert.equal(result.body.records[0].source, 'Agmarknet');
  assert.equal(result.body.records[0].locationScope, 'state');
  assert.equal(new URL(requestedUrls[0]).searchParams.get('filters[district]'), 'Bengaluru');
  assert.equal(new URL(requestedUrls[1]).searchParams.get('filters[district]'), null);
  assert.equal(new URL(requestedUrls[1]).searchParams.get('filters[state]'), 'Karnataka');
});

test('does not use mock data when state retry returns government records', async () => {
  const requestedUrls: string[] = [];
  mockGovernmentApi([governmentResponse([]), governmentResponse([governmentRecord({ commodity: 'Onion', district: 'Mysuru' })])], requestedUrls);

  const result = await request();

  assert.equal(result.body.records.length, 1);
  assert.equal(result.body.records[0].source, 'Agmarknet');
  assert.equal(header(result.response.headers, 'x-market-data-source'), 'government');
  assert.equal(header(result.response.headers, 'x-market-data-fallback'), 'false');
  assert.equal(header(result.response.headers, 'x-market-data-location-scope'), 'state');
});

test('uses mock fallback only after district and state are empty when enabled', async () => {
  const requestedUrls: string[] = [];
  env.marketDataFallbackEnabled = true;
  mockGovernmentApi([governmentResponse([]), governmentResponse([])], requestedUrls);

  const result = await request();

  assert.equal(result.response.status, 200);
  assert.equal(header(result.response.headers, 'x-market-data-source'), 'mock-fallback');
  assert.equal(header(result.response.headers, 'x-market-data-fallback'), 'true');
  assert.equal(result.body.source, 'mock-fallback');
  assert.equal(result.body.fallback, true);
  assert.equal(requestedUrls.length, 2);
});

test('returns the government error instead of mock fallback when disabled', async () => {
  const requestedUrls: string[] = [];
  env.marketDataFallbackEnabled = false;
  mockGovernmentApi([governmentResponse([]), governmentResponse([])], requestedUrls);

  const result = await request();

  assert.equal(result.response.status, 500);
  assert.equal(header(result.response.headers, 'x-market-data-source'), undefined);
  assert.equal(requestedUrls.length, 2);
});
