import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';

process.env.AUTH_REQUIRED = 'true';
process.env.DATABASE_PROVIDER = 'local';
process.env.AUTH_TOKENS = 'farmer-ondc-token=farmer-ondc:farmer,buyer-ondc-token=buyer-ondc:buyer,other-buyer-ondc-token=other-buyer:buyer';

let app: (typeof import('../src/app'))['app'];
let server: Server;
let baseUrl = '';

before(async () => {
  ({ app } = await import('../src/app'));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
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

async function createListing(crop: string): Promise<string> {
  const response = await request('/api/listings', {
    method: 'POST',
    body: JSON.stringify({ crop, grade: 'Grade A', quantityKg: 20, pricePerKg: 30, harvestDate: '2026-09-23', location: 'Nizamabad' }),
  }, 'farmer-ondc-token');
  assert.equal(response.status, 201);
  const payload = await response.json() as { listing: { id: string } };
  return payload.listing.id;
}

test('ONDC-style search and select expose active AgriNode listings and a quote', async () => {
  const listingId = await createListing('ONDC Test Tomato');
  const search = await request('/api/ondc/search', {
    method: 'POST',
    body: JSON.stringify({ crop: 'test tomato', location: 'Nizamabad' }),
  });
  assert.equal(search.status, 200);
  const searchPayload = await search.json() as {
    network: { integrated: boolean };
    catalog: Array<{ itemId: string; descriptor: string; pricePerKg: number }>;
  };
  assert.equal(searchPayload.network.integrated, false);
  assert.ok(searchPayload.catalog.some((item) => item.itemId === listingId && item.descriptor === 'ONDC Test Tomato'));

  const select = await request('/api/ondc/select', {
    method: 'POST',
    body: JSON.stringify({ listingId, quantityKg: 4 }),
  });
  assert.equal(select.status, 200);
  const selectPayload = await select.json() as { quote: { quantityKg: number; totalAmount: number } };
  assert.equal(selectPayload.quote.quantityKg, 4);
  assert.equal(selectPayload.quote.totalAmount, 120);
});

test('ONDC-style init and confirm use AgriNode order, settlement, and logistics logic', async () => {
  const listingId = await createListing('ONDC Test Potato');
  const init = await request('/api/ondc/init', {
    method: 'POST',
    body: JSON.stringify({ listingId, quantityKg: 2, deliveryLocation: 'Buyer depot' }),
  }, 'buyer-ondc-token');
  assert.equal(init.status, 200);
  const initPayload = await init.json() as { nextAction: string; quote: { totalAmount: number } };
  assert.equal(initPayload.nextAction, 'confirm');
  assert.equal(initPayload.quote.totalAmount, 60);

  const confirm = await request('/api/ondc/confirm', {
    method: 'POST',
    body: JSON.stringify({ listingId, quantityKg: 2, deliveryLocation: 'Buyer depot' }),
  }, 'buyer-ondc-token');
  assert.equal(confirm.status, 201);
  const confirmPayload = await confirm.json() as {
    network: { integrated: boolean };
    order: { id: string; status: string; buyerId: string };
    settlement: { actualTransfer: false; status: string };
    logistics: { status: string; provider: string };
    networkOrder: { orderId: string; itemId: string; buyerId: string; sellerId: string };
    networkStatus: string;
  };
  assert.equal(confirmPayload.network.integrated, false);
  assert.equal(confirmPayload.order.status, 'PLACED');
  assert.equal(confirmPayload.order.buyerId, 'buyer-ondc');
  assert.equal(confirmPayload.settlement.actualTransfer, false);
  assert.equal(confirmPayload.settlement.status, 'PENDING');
  assert.equal(confirmPayload.logistics.status, 'NOT_ASSIGNED');
  assert.equal(confirmPayload.logistics.provider, 'demo');
  assert.equal(confirmPayload.networkOrder.orderId, confirmPayload.order.id);
  assert.equal(confirmPayload.networkOrder.itemId, listingId);
  assert.equal(confirmPayload.networkOrder.sellerId, 'farmer-ondc');
  assert.equal(confirmPayload.networkStatus, 'Created');

  const statusPath = `/api/ondc/orders/${confirmPayload.order.id}/status`;
  const trackPath = `/api/ondc/orders/${confirmPayload.order.id}/track`;
  assert.equal((await request(statusPath)).status, 401);
  assert.equal((await request(statusPath, {}, 'other-buyer-ondc-token')).status, 403);

  const status = await request(statusPath, {}, 'buyer-ondc-token');
  assert.equal(status.status, 200);
  const statusPayload = await status.json() as { status: string; agrinodeStatus: string };
  assert.equal(statusPayload.status, 'Created');
  assert.equal(statusPayload.agrinodeStatus, 'PLACED');

  const tracking = await request(trackPath, {}, 'buyer-ondc-token');
  assert.equal(tracking.status, 200);
  const trackingPayload = await tracking.json() as { fulfillment: { deliveryLocation: string; status: string } };
  assert.equal(trackingPayload.fulfillment.deliveryLocation, 'Buyer depot');
  assert.equal(trackingPayload.fulfillment.status, 'NOT_ASSIGNED');
});