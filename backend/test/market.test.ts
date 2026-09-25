import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { GovernmentMarketDataError, GovernmentMarketDataProvider, buildGovernmentRequestUrl } from '../src/services/governmentMarketDataProvider';

const originalFetch = globalThis.fetch;
const provider = new GovernmentMarketDataProvider();

afterEach(() => {
  globalThis.fetch = originalFetch;
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

function response(records: unknown[], status = 200) {
  return new Response(JSON.stringify({ records }), { status, headers: { 'content-type': 'application/json' } });
}

test('builds encoded Karnataka state requests with api-key query auth only', () => {
  const url = new URL(buildGovernmentRequestUrl({ state: 'Karnataka', market: 'Bengaluru APMC & Fresh' }, 'state'));
  assert.equal(url.searchParams.get('filters[state]'), 'Karnataka');
  assert.equal(url.searchParams.get('filters[market]'), 'Bengaluru APMC & Fresh');
  assert.ok(url.searchParams.get('api-key'));
  assert.equal(url.searchParams.get('format'), 'json');
});

test('requests Bengaluru district records without widening the government filter', async () => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return response([governmentRecord()]);
  };

  const records = await provider.getPrices({ state: 'Karnataka', district: 'Bengaluru Urban' }, { scope: 'district' });
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('filters[state]'), 'Karnataka');
  assert.equal(url.searchParams.get('filters[district]'), 'Bengaluru Urban');
  assert.equal(url.searchParams.get('filters[market]'), null);
  assert.equal((requestedInit?.headers as Record<string, string> | undefined)?.Authorization, undefined);
  assert.equal(records[0].state, 'Karnataka');
  assert.equal(records[0].district, 'Bengaluru');
});

test('classifies government timeout as unavailable', async () => {
  globalThis.fetch = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
  await assert.rejects(() => provider.getPrices({ state: 'Karnataka' }, { scope: 'state' }), (error: unknown) => {
    assert.ok(error instanceof GovernmentMarketDataError);
    assert.equal(error.kind, 'timeout');
    return true;
  });
});

test('classifies malformed and empty government responses', async () => {
  globalThis.fetch = async () => new Response('{"records":{}}', { status: 200 });
  await assert.rejects(() => provider.getPrices({ state: 'Karnataka' }, { scope: 'state' }), (error: unknown) => error instanceof GovernmentMarketDataError && error.kind === 'invalid_response');

  globalThis.fetch = async () => response([]);
  await assert.rejects(() => provider.getPrices({ state: 'Karnataka' }, { scope: 'state' }), (error: unknown) => error instanceof GovernmentMarketDataError && error.kind === 'empty_response');
});

test('normalizes a successful government modal price to rupees per kilogram', async () => {
  globalThis.fetch = async () => response([governmentRecord()]);
  const records = await provider.getPrices({ state: 'Karnataka' }, { scope: 'state' });
  assert.equal(records.length, 1);
  assert.equal(records[0].sourcePrice, 1250);
  assert.equal(records[0].sourceUnit, 'quintal');
  assert.equal(records[0].normalizedPricePerKg, 12.5);
  assert.equal(records[0].source, 'Agmarknet');
  assert.equal(records.every((record) => record.state === 'Karnataka'), true);
});