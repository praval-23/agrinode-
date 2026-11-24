import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { clearGovernmentMarketCache } from '../src/services/governmentMarketDataProvider';

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

beforeEach(() => {
  clearGovernmentMarketCache();
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  env.marketDataFallbackEnabled = originalFallbackEnabled;
  clearGovernmentMarketCache();
});

function governmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    State: 'Karnataka',
    District: 'Bangalore',
    Market: 'Bangalore APMC',
    Commodity: 'Tomato',
    Variety: 'Local',
    Grade: 'Local',
    Arrival_Date: '21/11/2026',
    Min_Price: '1000',
    Max_Price: '1500',
    Modal_Price: '1250',
    ...overrides,
  };
}

function governmentResponse(records: unknown[], total = records.length, status = 200) {
  return new Response(JSON.stringify({ total, records }), { status, headers: { 'content-type': 'application/json' } });
}

async function request(): Promise<{ response: { status: number; headers: Record<string, string | string[] | undefined> }; body: { records: Array<{ locationScope?: string; source?: string }>; source: string; fallback: boolean; locationScope: string; dataQuality?: { latestGuaranteed: boolean; retrieval: string; freshnessWindowDays: number } } }> {
  return new Promise((resolve, reject) => {
    const clientRequest = httpRequest(`${baseUrl}/api/market/prices?state=Karnataka&district=Bengaluru&city=Bengaluru`, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve({
            response: { status: response.statusCode ?? 0, headers: response.headers },
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as { records: Array<{ locationScope?: string; source?: string }>; source: string; fallback: boolean; locationScope: string; dataQuality?: { latestGuaranteed: boolean; retrieval: string; freshnessWindowDays: number } },
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

test('uses recent district government records without state retry', async () => {
  const requestedUrls: string[] = [];
  mockGovernmentApi([governmentResponse([], 1), governmentResponse([governmentRecord()], 1)], requestedUrls);

  const result = await request();

  assert.equal(result.response.status, 200);
  assert.equal(header(result.response.headers, 'x-market-data-source'), 'government');
  assert.equal(header(result.response.headers, 'x-market-data-fallback'), 'false');
  assert.equal(header(result.response.headers, 'x-market-data-location-scope'), 'district');
  assert.equal(result.body.source, 'government');
  assert.equal(result.body.fallback, false);
  assert.equal(result.body.locationScope, 'district');
  assert.equal(result.body.records[0].locationScope, 'district');
  assert.equal(result.body.records[0].source, 'Agmarknet');
  assert.equal(result.body.dataQuality?.latestGuaranteed, false);
  assert.equal(new URL(requestedUrls[0]).searchParams.get('filters[District]'), 'Bangalore');
  assert.equal(new URL(requestedUrls[0]).searchParams.get('filters[State]'), 'Karnataka');
  assert.equal(new URL(requestedUrls[1]).searchParams.get('filters[District]'), 'Bangalore');
  assert.equal(requestedUrls.length, 2);
});

test('returns JSON for unmatched market endpoints', async () => {
  const response = await fetch(`${baseUrl}/api/market/not-a-route`);

  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/i);
  assert.deepEqual(await response.json(), { error: 'Market endpoint not found' });
});

test('retries state scope when district has no records', async () => {
  const requestedUrls: string[] = [];
  mockGovernmentApi([
    governmentResponse([], 0),
    governmentResponse([], 1),
    governmentResponse([governmentRecord({ District: 'Mysuru', Market: 'Mysuru APMC', Commodity: 'Onion' })], 1),
  ], requestedUrls);

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
  assert.equal(new URL(requestedUrls[0]).searchParams.get('filters[District]'), 'Bangalore');
  assert.equal(new URL(requestedUrls[1]).searchParams.get('filters[District]'), null);
  assert.equal(new URL(requestedUrls[1]).searchParams.get('filters[State]'), 'Karnataka');
});

test('does not use mock data when state retry returns government records', async () => {
  const requestedUrls: string[] = [];
  mockGovernmentApi([
    governmentResponse([], 0),
    governmentResponse([], 1),
    governmentResponse([governmentRecord({ Commodity: 'Onion', District: 'Mysuru' })], 1),
  ], requestedUrls);

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
  mockGovernmentApi([governmentResponse([], 0), governmentResponse([], 0)], requestedUrls);

  const result = await request();

  assert.equal(result.response.status, 200);
  assert.equal(header(result.response.headers, 'x-market-data-source'), 'mock-fallback');
  assert.equal(header(result.response.headers, 'x-market-data-fallback'), 'true');
  assert.equal(result.body.source, 'mock-fallback');
  assert.equal(result.body.fallback, true);
  assert.equal(result.body.records.every((record) => record.source === 'Mock'), true);
  assert.equal(requestedUrls.length, 2);
});

test('returns an unavailable response instead of mock data when fallback is disabled', async () => {
  const requestedUrls: string[] = [];
  env.marketDataFallbackEnabled = false;
  mockGovernmentApi([
    governmentResponse([], 0, 503),
    governmentResponse([], 0, 503),
  ], requestedUrls);

  const result = await request();

  assert.equal(result.response.status, 503);
  assert.equal(header(result.response.headers, 'x-market-data-source'), 'unavailable');
  assert.equal(requestedUrls.length, 2);
});

test('reports an empty government dataset as unavailable when mock fallback is disabled', async () => {
  const requestedUrls: string[] = [];
  env.marketDataFallbackEnabled = false;
  mockGovernmentApi([governmentResponse([], 0), governmentResponse([], 0)], requestedUrls);

  const result = await request();

  assert.equal(result.response.status, 200);
  assert.equal(result.body.source, 'unavailable');
  assert.equal(result.body.fallback, false);
  assert.equal(result.body.records.length, 0);
  assert.equal(header(result.response.headers, 'x-market-data-source'), 'unavailable');
});

test('uses state records when district candidates are stale and reports the bounded-tail limitation', async () => {
  const requestedUrls: string[] = [];
  mockGovernmentApi([
    governmentResponse([], 1),
    governmentResponse([governmentRecord({ Arrival_Date: '01/09/2026' })], 1),
    governmentResponse([], 1),
    governmentResponse([governmentRecord({ District: 'Kolar', Market: 'Kolar APMC' })], 1),
  ], requestedUrls);

  const result = await request();

  assert.equal(result.body.source, 'government');
  assert.equal(result.body.locationScope, 'state');
  assert.equal(result.body.records[0].source, 'Agmarknet');
  assert.equal(new URL(requestedUrls[2]).searchParams.get('filters[District]'), null);
});
