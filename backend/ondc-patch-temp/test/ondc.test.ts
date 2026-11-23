import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';

process.env.AUTH_REQUIRED = 'true';
process.env.AUTH_TOKENS = 'farmer-ondc-token=farmer-ondc:farmer,buyer-ondc-token=buyer-ondc:buyer';
process.env.DATABASE_PROVIDER = 'local';
process.env.SCAN_AI_PROVIDER = 'mock';

let app: (typeof import('../src/app'))['app'];
let server: Server;
let baseUrl = '';

before(async () => {
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

test('ONDC-style search exposes active AgriNode listings as catalogue items', async () => {
  const created = await request('/api/listings', {
    method: 'POST',
    body: JSON.stringify({
      crop: 'ONDC Tomato',
      grade: 'Grade A',
      quantityKg: 20,
      pricePerKg: 30,
      harvestDate: '23 Sep 2026',
      location: 'Nizamabad',
    }),
  }, 'farmer-ondc-token');

  assert.equal(created.status, 201);

  const response = await request('/api/ondc/search', {
    method: 'POST',
    body: JSON.stringify({ crop: 'ONDC Tomato', location: 'Nizamabad' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json() as {
    network: { integrated: boolean };
    catalog: Array<{ itemId: string; descriptor: string; pricePerKg: number }>;
  };

  assert.equal(payload.network.integrated, false);
  assert.ok(payload.catalog.some((item) => item.descriptor === 'ONDC Tomato'));
});

test('ONDC-style select validates inventory and returns a quote', async () => {
  const created = await request('/api/listings', {
    method: 'POST',
    body: JSON.stringify({
      crop: 'ONDC Onion',
      grade: 'Grade B',
      quantityKg: 10,
      pricePerKg: 25,
      harvestDate: '23 Sep 2026',
      location: 'Nizamabad',
    }),
  }, 'farmer-ondc-token');

  const createdPayload = await created.json() as { listing: { id: string } };

  const response = await request('/api/ondc/select', {
    method: 'POST',
    body: JSON.stringify({ listingId: createdPayload.listing.id, quantityKg: 4 }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json() as { quote: { quantityKg: number; totalAmount: number } };
  assert.equal(payload.quote.quantityKg, 4);
  assert.equal(payload.quote.totalAmount, 100);
});

test('ONDC-style confirm reuses the existing order transaction', async () => {
  const created = await request('/api/listings', {
    method: 'POST',
    body: JSON.stringify({
      crop: 'ONDC Potato',
      grade: 'Grade A',
      quantityKg: 8,
      pricePerKg: 20,
      harvestDate: '23 Sep 2026',
      location: 'Nizamabad',
    }),
  }, 'farmer-ondc-token');

  const createdPayload = await created.json() as { listing: { id: string } };

  const response = await request('/api/ondc/confirm', {
    method: 'POST',
    body: JSON.stringify({
      listingId: createdPayload.listing.id,
      quantityKg: 2,
      deliveryLocation: 'Buyer depot',
    }),
  }, 'buyer-ondc-token');

  assert.equal(response.status, 201);
  const payload = await response.json() as {
    order: { id: string; status: string };
    networkOrder: { orderId: string; itemId: string; buyerId: string; sellerId: string };
    networkStatus: string;
  };

  assert.equal(payload.order.status, 'PLACED');
  assert.equal(payload.networkOrder.orderId, payload.order.id);
  assert.equal(payload.networkOrder.itemId, createdPayload.listing.id);
  assert.equal(payload.networkOrder.buyerId, 'buyer-ondc');
  assert.equal(payload.networkStatus, 'Created');

  const status = await request(`/api/ondc/orders/${payload.order.id}/status`);
  assert.equal(status.status, 200);

  const tracking = await request(`/api/ondc/orders/${payload.order.id}/track`);
  assert.equal(tracking.status, 200);
});
