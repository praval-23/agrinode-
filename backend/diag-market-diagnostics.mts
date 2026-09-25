// Market data pipeline diagnostic (development only).
// Run with: cd backend && PORT=3000 npx tsx diag-market-diagnostics.mts
// Prints: government raw record count, state distribution, Karnataka/Bengaluru counts,
// normalized + location-matched + final displayed record counts, and the exact markets
// that reach the Market UI. Never prints the API key.
process.env.NODE_ENV = 'development';
import 'dotenv/config';
import { app } from './src/app';

const apiKey = process.env.GOVERNMENT_API_KEY;
const baseUrl = (process.env.GOVERNMENT_API_BASE_URL ?? 'https://api.data.gov.in/resource').replace(/\/+$/, '');
const resourceId = process.env.GOVERNMENT_MARKET_RESOURCE_ID ?? '9ef84268-d588-465a-a308-a864a43d0070';

async function rawProbe(filters: Record<string, string>, limit = 100) {
  const params = new URLSearchParams({ 'api-key': apiKey!, format: 'json', limit: String(limit), offset: '0' });
  for (const [key, value] of Object.entries(filters)) params.set(`filters[${key}]`, value);
  const response = await fetch(`${baseUrl}/${resourceId}?${params.toString()}`);
  const payload = await response.json() as { total?: number; records?: Record<string, unknown>[] };
  const pick = (record: Record<string, unknown>, ...names: string[]) => {
    const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const name of names) {
      const hit = Object.entries(record).find(([recordKey]) => norm(recordKey) === norm(name));
      if (typeof hit?.[1] === 'string') return hit[1] as string;
    }
    return undefined;
  };
  const records = payload.records ?? [];
  return {
    total: payload.total ?? records.length,
    fieldNames: records[0] ? Object.keys(records[0]) : [],
    states: [...new Set(records.map((record) => pick(record, 'state', 'state_name')).filter(Boolean))] as string[],
    karnataka: records.filter((record) => pick(record, 'state', 'state_name')?.trim().toLowerCase() === 'karnataka').length,
    bengaluru: records.filter((record) => pick(record, 'district', 'district_name')?.trim().toLowerCase().replace(/\s+urban$/, '') === 'bengaluru').length,
  };
}

async function routeProbe(query: Record<string, string>) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = typeof server.address() === 'object' ? (server.address() as { port: number }).port : 0;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/market/prices?${new URLSearchParams(query).toString()}`);
    const body = await response.json() as {
      records?: Array<{ market: string; district: string; state: string; commodity: string }>;
      source?: string; fallback?: boolean; locationScope?: string;
    };
    return { status: response.status, headers: response.headers, body };
  } finally {
    server.close();
  }
}

function summarize(body: { records?: Array<{ market: string; district: string; state: string; commodity: string }>; source?: string; fallback?: boolean; locationScope?: string }) {
  const records = body.records ?? [];
  const stateDistribution = new Map<string, number>();
  for (const record of records) stateDistribution.set(record.state, (stateDistribution.get(record.state) ?? 0) + 1);
  const commodities = new Map<string, number>();
  for (const record of records) commodities.set(record.commodity.trim().toLowerCase(), (commodities.get(record.commodity.trim().toLowerCase()) ?? 0) + 1);
  return { records, stateDistribution, uniqueCommodityCount: commodities.size, commodities };
}

console.log('=== 1. GOVERNMENT RAW API (unfiltered, page 1) ===');
const raw = await rawProbe({});
console.log('government raw record count (page 1):', raw.total === undefined ? '?' : `${raw.total} total in dataset`);
console.log('exact field names:', raw.fieldNames.join(', '));
console.log('distinct states on page 1:', raw.states.join(', ') || '(none)');
console.log('Karnataka records on page 1:', raw.karnataka, '| Bengaluru-district records on page 1:', raw.bengaluru);

console.log('\n=== 2. GOVERNMENT RAW API (filters[state]=Karnataka) ===');
const karnataka = await rawProbe({ state: 'Karnataka' });
console.log('Karnataka-filtered record count:', karnataka.total);

console.log('\n=== 3. END-TO-END /api/market/prices (Bengaluru / Bengaluru Urban / Karnataka) ===');
const endToEnd = await routeProbe({ latitude: '12.9716', longitude: '77.5946', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka' });
const summary = summarize(endToEnd.body);
const records = summary.records;
const districtMatched = records.filter((record) => record.district.trim().toLowerCase().replace(/\s+urban$/, '') === 'bengaluru');
const scopeDistrict = (endToEnd.body as { records?: Array<{ locationScope?: string }> }).records?.filter((record) => record.locationScope === 'district').length ?? 0;
const scopeState = (endToEnd.body as { records?: Array<{ locationScope?: string }> }).records?.filter((record) => record.locationScope === 'state').length ?? 0;

console.log('HTTP status:', endToEnd.status);
console.log('X-Market-Data-Source:', endToEnd.headers.get('X-Market-Data-Source'), '| fallback:', endToEnd.headers.get('X-Market-Data-Fallback'), '| location scope:', endToEnd.body.locationScope);
console.log('total district records fetched (raw, page 1):', (await rawProbe({ state: 'Karnataka', district: 'Bengaluru Urban' })).total);
console.log('final unique commodities selected:', summary.uniqueCommodityCount);
console.log('district-scope selected:', scopeDistrict, '| state-scope selected:', scopeState);
console.log('final displayed crop names:', records.map((record) => record.commodity).join(', '));
console.log('location-matched record count (district=Bengaluru/Bengaluru Urban):', districtMatched.length, 'of', records.length);
console.log('state distribution:', [...summary.stateDistribution.entries()].map(([state, count]) => `${state}: ${count}`).join(', ') || '(none)');
console.log('\nDIAG COMPLETE');
