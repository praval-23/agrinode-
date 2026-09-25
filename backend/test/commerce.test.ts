import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { diversifyByCommodity } from '../src/services/marketDiversification';
import { buildMarketHistory } from '../src/services/marketHistory';

process.env.AUTH_REQUIRED = 'true';
process.env.DATABASE_PROVIDER = 'local';
process.env.AUTH_TOKENS = 'farmer-a-token=farmer-a:farmer,farmer-b-token=farmer-b:farmer,buyer-a-token=buyer-a:buyer,buyer-b-token=buyer-b:buyer';
process.env.SCAN_AI_PROVIDER = 'mock';

let app: (typeof import('../src/app'))['app'];
let normalizeGovernmentPriceToKg: typeof import('../src/services/governmentMarketDataProvider')['normalizeGovernmentPriceToKg'];
let server: Server;
let baseUrl = '';

before(async () => {
  ({ normalizeGovernmentPriceToKg } = await import('../src/services/governmentMarketDataProvider'));
  ({ app } = await import('../src/app'));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path: string, options: RequestInit = {}, token?: string): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function json<T>(response: Response): Promise<T> { return response.json() as Promise<T>; }

test('rejects invalid listings and accepts a valid farmer listing', async () => {
  const invalid = await request('/api/listings', { method: 'POST', body: JSON.stringify({ crop: 'Tomato' }) }, 'farmer-a-token');
  assert.equal(invalid.status, 400);
  const created = await request('/api/listings', { method: 'POST', body: JSON.stringify({ farmerId: 'farmer-a', crop: 'Test Tomato', grade: 'Grade A', quantityKg: 10, pricePerKg: 20, harvestDate: '11 Sep 2026', location: 'Nizamabad', description: 'test' }) }, 'farmer-a-token');
  assert.equal(created.status, 201);
  const payload = await json<{ listing: { id: string } }>(created);
  assert.ok(payload.listing.id);
});

test('prevents cross-farmer listing modification', async () => {
  const created = await request('/api/listings', { method: 'POST', body: JSON.stringify({ crop: 'Other Tomato', grade: 'Grade B', quantityKg: 5, pricePerKg: 10, harvestDate: '11 Sep 2026', location: 'Nizamabad' }) }, 'farmer-b-token');
  const { listing } = await json<{ listing: { id: string } }>(created);
  const denied = await request(`/api/listings/${listing.id}`, { method: 'PATCH', body: JSON.stringify({ pricePerKg: 1 }) }, 'farmer-a-token');
  assert.equal(denied.status, 403);
});

test('creates orders, rejects insufficient quantity, and enforces order access', async () => {
  const listingResponse = await request('/api/listings', { method: 'POST', body: JSON.stringify({ crop: 'Order Tomato', grade: 'Grade A', quantityKg: 5, pricePerKg: 12, harvestDate: '11 Sep 2026', location: 'Nizamabad' }) }, 'farmer-a-token');
  const { listing } = await json<{ listing: { id: string } }>(listingResponse);
  const orderResponse = await request('/api/orders', { method: 'POST', body: JSON.stringify({ listingId: listing.id, quantityKg: 3, deliveryLocation: 'Buyer depot' }) }, 'buyer-a-token');
  assert.equal(orderResponse.status, 201);
  const orderPayload = await json<{ order: { id: string; totalAmount: number }; settlement: { farmerAmount: number; transporterAmount: number; serviceNodeAmount: number; actualTransfer: false } }>(orderResponse);
  assert.equal(orderPayload.settlement.farmerAmount + orderPayload.settlement.transporterAmount + orderPayload.settlement.serviceNodeAmount, orderPayload.order.totalAmount);
  assert.equal(orderPayload.settlement.actualTransfer, false);
  const insufficient = await request('/api/orders', { method: 'POST', body: JSON.stringify({ listingId: listing.id, quantityKg: 3, deliveryLocation: 'Buyer depot' }) }, 'buyer-a-token');
  assert.equal(insufficient.status, 409);
  const denied = await request(`/api/orders/${orderPayload.order.id}`, {}, 'buyer-b-token');
  assert.equal(denied.status, 403);
  const invalidStatus = await request(`/api/orders/${orderPayload.order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'UNKNOWN' }) }, 'farmer-a-token');
  assert.equal(invalidStatus.status, 400);
});

test('supports demo logistics and settlement lifecycle', async () => {
  const listingResponse = await request('/api/listings', { method: 'POST', body: JSON.stringify({ crop: 'Lifecycle Tomato', grade: 'Grade A', quantityKg: 5, pricePerKg: 10, harvestDate: '11 Sep 2026', location: 'Nizamabad' }) }, 'farmer-a-token');
  const { listing } = await json<{ listing: { id: string } }>(listingResponse);
  const orderResponse = await request('/api/orders', { method: 'POST', body: JSON.stringify({ listingId: listing.id, quantityKg: 1, deliveryLocation: 'Buyer depot' }) }, 'buyer-a-token');
  const { order } = await json<{ order: { id: string } }>(orderResponse);
  const logistics = await request(`/api/orders/${order.id}/logistics`, { method: 'PATCH', body: JSON.stringify({ transporterId: 'transporter-demo', status: 'ASSIGNED', routeStatus: 'DEMO_ROUTE' }) }, 'farmer-a-token');
  assert.equal(logistics.status, 200);
  const settlement = await request(`/api/orders/${order.id}/settlement`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) }, 'buyer-a-token');
  assert.equal(settlement.status, 200);
  const settlementPayload = await json<{ settlement: { status: string; actualTransfer: false } }>(settlement);
  assert.equal(settlementPayload.settlement.status, 'COMPLETED');
  assert.equal(settlementPayload.settlement.actualTransfer, false);
});

test('diversifies commodities without selecting records outside supplied location pools', () => {
  const marketRecord = (commodity: string, market: string, district: string, price: number) => ({ id: commodity, name: commodity, category: 'vegetable', commodity, variety: 'Local', market, district, state: 'Telangana', date: '11/09/2026', sourcePrice: price, sourceUnit: 'kg' as const, minPrice: price, maxPrice: price, modalPrice: price, normalizedPricePerKg: price, previousPricePerKg: null, changePercent: null, trend: [], demand: null, source: 'Agmarknet' as const, lastUpdated: '2026-09-11T00:00:00.000Z', icon: 'leaf', latitude: null, longitude: null });
  const result = diversifyByCommodity({ districtRecords: [marketRecord('Tomato', 'Nizamabad', 'Nizamabad', 20)], stateRecords: [marketRecord('Onion', 'Hyderabad', 'Hyderabad', 25)], city: 'Nizamabad', district: 'Nizamabad' });
  assert.deepEqual(result.selected.map((item) => item.commodity), ['Tomato', 'Onion']);
  assert.ok(result.selected.every((item) => item.state === 'Telangana'));
});

test('returns every unique commodity instead of applying a watchlist cap', () => {
  const records = Array.from({ length: 20 }, (_, index) => ({
    id: `commodity-${index}`,
    name: `Commodity ${index}`,
    category: 'vegetable',
    commodity: `Commodity ${index}`,
    variety: 'Local',
    market: 'Nizamabad',
    district: 'Nizamabad',
    state: 'Telangana',
    date: '11/09/2026',
    sourcePrice: 10 + index,
    sourceUnit: 'kg' as const,
    minPrice: 10 + index,
    maxPrice: 10 + index,
    modalPrice: 10 + index,
    normalizedPricePerKg: 10 + index,
    previousPricePerKg: null,
    changePercent: null,
    trend: [],
    demand: null,
    source: 'Agmarknet' as const,
    lastUpdated: '2026-09-11T00:00:00.000Z',
    icon: 'leaf',
    latitude: null,
    longitude: null,
  }));
  const result = diversifyByCommodity({ districtRecords: records, city: 'Nizamabad', district: 'Nizamabad' });
  assert.equal(result.selected.length, 20);
  assert.equal(new Set(result.selected.map((item) => item.commodity)).size, 20);
});

test('rejects malformed scanner input before provider fallback', async () => {
  const response = await request('/api/scan/quality', { method: 'POST', body: JSON.stringify({ imageBase64: 'bad' }) });
  assert.equal(response.status, 400);
});

test('returns structured mock scan output without claiming Gemini', async () => {
  const response = await request('/api/scan/quality', { method: 'POST', body: JSON.stringify({ imageBase64: Buffer.alloc(32).toString('base64'), mimeType: 'image/jpeg' }) });
  assert.equal(response.status, 200);
  const payload = await json<{ source: string; fallback: boolean; result: { crop: { name: string }; quality: { grade: string; score: number }; scannedAt: string } }>(response);
  assert.equal(payload.source, 'mock');
  assert.equal(payload.fallback, false);
  assert.ok(payload.result.crop.name);
  assert.ok(['A', 'B', 'C'].includes(payload.result.quality.grade));
  assert.ok(payload.result.quality.score >= 0 && payload.result.quality.score <= 100);
  assert.ok(payload.result.scannedAt);
});

function historyRecord(date: string, price: number, market = 'Nizamabad'): import('../src/types/market').MarketPrice {
  return { id: `${date}-${price}`, name: 'Tomato', category: 'vegetable', commodity: 'Tomato', variety: 'Local', market, district: 'Nizamabad', state: 'Telangana', date, sourcePrice: price * 100, sourceUnit: 'quintal', minPrice: price * 100, maxPrice: price * 100, modalPrice: price * 100, normalizedPricePerKg: price, previousPricePerKg: null, changePercent: null, trend: [], demand: null, source: 'Agmarknet', lastUpdated: '2026-09-11T00:00:00.000Z', icon: 'TO', latitude: null, longitude: null };
}

test('builds normalized chronological history and calculates the immediate previous change', () => {
  const result = buildMarketHistory([historyRecord('09/09/2026', 54.2), historyRecord('11/09/2026', 56.95), historyRecord('10/09/2026', 55)], { commodity: 'Tomato', market: 'Nizamabad', days: 7, locationScope: 'district', source: 'government' });
  assert.deepEqual(result.history.map((point) => point.date), ['09/09/2026', '10/09/2026', '11/09/2026']);
  assert.deepEqual(result.history.map((point) => point.price), [54.2, 55, 56.95]);
  assert.equal(result.currentPrice, 56.95);
  assert.equal(result.previousPrice, 55);
  assert.equal(result.change, 1.95);
  assert.equal(result.changePercent, 3.55);
  assert.equal(result.demand, null);
});

test('returns real points only when historical data is insufficient and respects market filtering', () => {
  const result = buildMarketHistory([historyRecord('11/09/2026', 56.95, 'Nizamabad'), historyRecord('10/09/2026', 54, 'Hyderabad')], { commodity: 'Tomato', market: 'Nizamabad', days: 7, locationScope: 'district', source: 'government' });
  assert.equal(result.history.length, 1);
  assert.equal(result.currentPrice, 56.95);
  assert.equal(result.previousPrice, null);
  assert.equal(result.change, null);
  assert.equal(result.changePercent, null);
  assert.equal(result.market, 'Nizamabad');
});

test('normalizes government historical modal prices using their source unit', () => {
  assert.equal(normalizeGovernmentPriceToKg(1250, 'quintal'), 12.5);
  assert.equal(normalizeGovernmentPriceToKg(2500, 'tonne'), 2.5);
  assert.equal(normalizeGovernmentPriceToKg(56.95, 'kg'), 56.95);
});