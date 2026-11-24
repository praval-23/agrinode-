import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { env } from '../src/config/env';
import {
  calculateTailOffset,
  clearGovernmentMarketCache,
  GovernmentMarketDataError,
  GovernmentMarketDataProvider,
  buildGovernmentRequestUrl,
} from '../src/services/governmentMarketDataProvider';
import { parseArrivalDate } from '../src/services/marketDiversification';

const originalFetch = globalThis.fetch;
const originalApiKey = env.government.apiKey;
const originalPriceUnit = env.government.priceUnit;
const originalLimit = env.government.limit;
const provider = new GovernmentMarketDataProvider();

afterEach(() => {
  globalThis.fetch = originalFetch;
  env.government.apiKey = originalApiKey;
  env.government.priceUnit = originalPriceUnit;
  env.government.limit = originalLimit;
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
    Max_Price: 1500,
    Modal_Price: '1250',
    ...overrides,
  };
}

function response(records: unknown[], total = records.length, status = 200) {
  return new Response(JSON.stringify({ total, records }), { status, headers: { 'content-type': 'application/json' } });
}

function useApiKey() {
  env.government.apiKey = 'test-api-key';
}

test('builds encoded resource requests with capitalized filters and optional fields', () => {
  useApiKey();
  const url = new URL(buildGovernmentRequestUrl({
    state: 'Karnataka',
    district: 'Bengaluru Urban',
    commodity: 'Tomato & cherry',
    market: 'Bangalore APMC',
  }, 'district', 5, 25));
  assert.equal(url.pathname, `/resource/${env.government.resourceId}`);
  assert.equal(url.searchParams.get('filters[State]'), 'Karnataka');
  assert.equal(url.searchParams.get('filters[District]'), 'Bangalore');
  assert.equal(url.searchParams.get('filters[Commodity]'), 'Tomato & cherry');
  assert.equal(url.searchParams.get('filters[Market]'), 'Bangalore APMC');
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(url.searchParams.get('offset'), '25');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('api-key'), 'test-api-key');

  const stateUrl = new URL(buildGovernmentRequestUrl({ state: 'Karnataka' }, 'state'));
  assert.equal(stateUrl.searchParams.get('filters[District]'), null);
  assert.equal(stateUrl.searchParams.get('filters[Commodity]'), null);
});

test('calculates a bounded tail offset and sorts and deduplicates by reporting date', async () => {
  useApiKey();
  env.government.priceUnit = 'quintal';
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    if (requestedUrls.length === 1) return response([], 500);
    return response([
      governmentRecord({ Arrival_Date: '20/11/2026', Modal_Price: 1400 }),
      governmentRecord({ Arrival_Date: '21/11/2026', Modal_Price: '1250' }),
      governmentRecord({ Arrival_Date: '21/11/2026', Modal_Price: '1250' }),
      governmentRecord({ Arrival_Date: '07/11/2026', Modal_Price: 1340 }),
    ], 500);
  };

  assert.equal(calculateTailOffset(73_693, 5), 73_688);
  const records = await provider.getPrices({ state: 'Karnataka', commodity: 'Tomato' }, { scope: 'state' });
  assert.equal(requestedUrls.length, 2);
  assert.equal(new URL(requestedUrls[0]).searchParams.get('limit'), '1');
  assert.equal(new URL(requestedUrls[1]).searchParams.get('offset'), String(env.government.limit ? 500 - env.government.limit : 0));
  assert.deepEqual(records.map((record) => record.date), ['21/11/2026', '20/11/2026', '07/11/2026']);
  assert.equal(records[0].normalizedPricePerKg, 12.5);
  assert.equal(records[0].minPricePerKg, 10);
  assert.equal(records[0].maxPricePerKg, 15);
  assert.equal(records[0].source, 'Agmarknet');
  assert.equal(records[0].sourceUnit, 'quintal');
});

test('recalculates the tail offset when total changes between probe and data requests', async () => {
  useApiKey();
  const requestedOffsets: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedOffsets.push(url.searchParams.get('offset') ?? '');
    if (requestedOffsets.length === 1) return response([], 500);
    if (requestedOffsets.length === 2) return response([governmentRecord()], 700);
    return response([governmentRecord({ Arrival_Date: '20/11/2026' })], 700);
  };

  await provider.getPrices({ state: 'Karnataka', commodity: 'Tomato' }, { scope: 'state' });
  assert.equal(requestedOffsets[0], '0');
  assert.equal(requestedOffsets[1], String(500 - env.government.limit));
  assert.equal(requestedOffsets[2], String(700 - env.government.limit));
});

test('does not convert prices to per-kilogram until the source unit is configured or returned', async () => {
  useApiKey();
  env.government.priceUnit = undefined;
  globalThis.fetch = async () => response([governmentRecord()], 1);
  const record = (await provider.getPrices({ state: 'Karnataka' }, { scope: 'state' }))[0];
  assert.equal(record.sourcePrice, 1250);
  assert.equal(record.sourceUnit, null);
  assert.equal(record.normalizedPricePerKg, null);
  assert.equal(record.minPricePerKg, null);

  clearGovernmentMarketCache();
  globalThis.fetch = async () => response([governmentRecord({ Unit: 'kg' })], 1);
  const explicitlyUnitTagged = (await provider.getPrices({ state: 'Tamil Nadu' }, { scope: 'state' }))[0];
  assert.equal(explicitlyUnitTagged.sourceUnit, 'kg');
  assert.equal(explicitlyUnitTagged.normalizedPricePerKg, 1250);
});

test('parses valid DD/MM/YYYY dates and rejects impossible dates', () => {
  assert.equal(parseArrivalDate('21/11/2026'), Date.UTC(2026, 10, 21));
  assert.equal(parseArrivalDate('2026-11-21'), Date.UTC(2026, 10, 21));
  assert.equal(parseArrivalDate('31/02/2026'), null);
  assert.equal(parseArrivalDate('not-a-date'), null);
});

test('marks older valid observations as historical', async () => {
  useApiKey();
  globalThis.fetch = async () => response([governmentRecord({ Arrival_Date: '01/09/2026' })], 1);
  const [record] = await provider.getPrices({ state: 'Rajasthan' }, { scope: 'state' });
  assert.equal(record.freshness, 'historical');
});

test('returns an empty result for a valid empty dataset', async () => {
  useApiKey();
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return response([], 0);
  };
  assert.deepEqual(await provider.getPrices({ state: 'Karnataka' }, { scope: 'state' }), []);
  assert.equal(callCount, 1);
});

test('rejects malformed JSON, malformed response shapes, and invalid prices', async () => {
  useApiKey();
  globalThis.fetch = async () => new Response('not json', { status: 200 });
  await assert.rejects(() => provider.getPrices({ state: 'Karnataka' }, { scope: 'state' }),
    (error: unknown) => error instanceof GovernmentMarketDataError && error.kind === 'invalid_response');

  clearGovernmentMarketCache();
  globalThis.fetch = async () => new Response('{"total":1,"records":{}}', { status: 200 });
  await assert.rejects(() => provider.getPrices({ state: 'Kerala' }, { scope: 'state' }),
    (error: unknown) => error instanceof GovernmentMarketDataError && error.kind === 'invalid_response');

  clearGovernmentMarketCache();
  globalThis.fetch = async () => response([governmentRecord({ Modal_Price: '-1' })]);
  await assert.rejects(() => provider.getPrices({ state: 'Gujarat' }, { scope: 'state' }),
    (error: unknown) => error instanceof GovernmentMarketDataError && error.kind === 'invalid_response');
});

test('classifies timeout, HTTP, and connection failures without exposing request credentials', async () => {
  useApiKey();
  globalThis.fetch = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
  await assert.rejects(() => provider.getPrices({ state: 'Karnataka' }, { scope: 'state' }),
    (error: unknown) => error instanceof GovernmentMarketDataError && error.kind === 'timeout');

  clearGovernmentMarketCache();
  globalThis.fetch = async () => new Response('forbidden', { status: 403 });
  await assert.rejects(() => provider.getPrices({ state: 'Tamil Nadu' }, { scope: 'state' }),
    (error: unknown) => error instanceof GovernmentMarketDataError && error.kind === 'authentication');

  clearGovernmentMarketCache();
  globalThis.fetch = async () => { throw new Error('connection failed: https://example.invalid/?api-key=test-api-key'); };
  await assert.rejects(() => provider.getPrices({ state: 'Kerala' }, { scope: 'state' }),
    (error: unknown) => error instanceof GovernmentMarketDataError && error.kind === 'request' && !error.message.includes('test-api-key'));
});

test('logs sanitized upstream diagnostics for nested DNS failures', async () => {
  useApiKey();
  const entries: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => { entries.push(args); };
  globalThis.fetch = async () => {
    throw Object.assign(new Error('request failed https://api.data.gov.in/resource?id=private&api-key=test-api-key', {
      cause: Object.assign(new Error('lookup failed'), { code: 'ENOTFOUND' }),
    }), { code: 'EAI_AGAIN' });
  };

  try {
    await assert.rejects(() => provider.getPrices({
      state: 'Karnataka',
      district: 'Bengaluru',
      commodity: 'Tomato',
    }, { scope: 'district' }), (error: unknown) => error instanceof GovernmentMarketDataError && error.kind === 'request');
  } finally {
    console.error = originalConsoleError;
  }

  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes('test-api-key'), false);
  assert.match(serialized, /"apiKeyConfigured":true/);
  assert.match(serialized, /"apiHostname":"api\.data\.gov\.in"/);
  assert.match(serialized, /"filters":\{"State":"Karnataka","District":"Bangalore","Commodity":"Tomato"\}/);
  assert.match(serialized, /"offset":0/);
  assert.match(serialized, /"limit":1/);
  assert.match(serialized, /"transportCategory":"dns"/);
  assert.match(serialized, /"errorCode":null/);
  assert.match(serialized, /"code":"EAI_AGAIN"/);
  assert.match(serialized, /"httpStatus":null/);
  assert.match(serialized, /"requestDurationMs":\d+/);
});

test('logs the number of records rejected during normalization', async () => {
  useApiKey();
  const entries: unknown[][] = [];
  const originalConsoleInfo = console.info;
  console.info = (...args: unknown[]) => { entries.push(args); };
  globalThis.fetch = async (_input, init) => {
    const url = new URL(String(_input));
    if (url.searchParams.get('limit') === '1') return response([], 2);
    return response([
      governmentRecord({ Modal_Price: '-1' }),
      governmentRecord({ Commodity: 'Onion' }),
    ], 2);
  };

  try {
    const prices = await provider.getPrices({ state: 'Karnataka' }, { scope: 'state' });
    assert.equal(prices.length, 1);
  } finally {
    console.info = originalConsoleInfo;
  }

  const resultLog = entries.find((entry) => entry[0] === '[market] government provider result');
  assert.ok(resultLog);
  const details = resultLog[1] as Record<string, unknown>;
  assert.equal(details.returnedRecordCount, 2);
  assert.equal(details.normalizedRecordCount, 1);
  assert.equal(details.rejectedDuringNormalization, 1);
});

test('shares concurrent upstream requests and maps historical Bangalore districts for matching', async () => {
  useApiKey();
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return response([governmentRecord()], 1);
  };
  const [left, right] = await Promise.all([
    provider.getPrices({ state: 'Karnataka', district: 'Bengaluru Urban' }, { scope: 'district' }),
    provider.getPrices({ state: 'Karnataka', district: 'Bengaluru Urban' }, { scope: 'district' }),
  ]);
  assert.equal(callCount, 2);
  assert.equal(left[0].district, 'Bangalore');
  assert.equal(left[0].district, right[0].district);
});
