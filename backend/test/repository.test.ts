import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalJsonCommerceRepository } from '../src/repositories/localCommerceRepository';

const localRepository = new LocalJsonCommerceRepository();

const listingInput = {
  farmerId: `test-farmer-${Date.now()}`,
  crop: 'Repository Tomato',
  grade: 'Grade A',
  quantityKg: 5,
  pricePerKg: 20,
  harvestDate: '2026-09-11',
  location: 'Nizamabad',
  description: 'repository test',
};

test('local repository supports listing, order, settlement, and logistics operations', async () => {
  const listing = await localRepository.createListing(listingInput);
  assert.equal((await localRepository.getListing(listing.id))?.id, listing.id);
  assert.equal((await localRepository.listListings('ACTIVE')).some((item) => item.id === listing.id), true);

  const result = await localRepository.createOrder({ buyerId: `test-buyer-${Date.now()}`, listingId: listing.id, quantityKg: 2, deliveryLocation: 'Buyer depot' });
  assert.ok('order' in result);
  if (!('order' in result)) return;
  assert.equal(result.order.totalAmount, 40);
  assert.equal(result.settlement.farmerAmount + result.settlement.transporterAmount + result.settlement.serviceNodeAmount, result.settlement.totalAmount);
  assert.equal((await localRepository.getLogistics(result.order.id))?.orderId, result.order.id);
  assert.equal((await localRepository.updateLogistics(result.order.id, { status: 'ASSIGNED', routeStatus: 'DEMO_ROUTE' }))?.status, 'ASSIGNED');
  assert.equal((await localRepository.updateSettlementStatus(result.order.id, 'COMPLETED'))?.status, 'COMPLETED');
  assert.equal((await localRepository.listOrders({ buyerId: result.order.buyerId })).length, 1);
});

test('local repository rejects insufficient quantity', async () => {
  const listing = await localRepository.createListing({ ...listingInput, farmerId: `test-farmer-insufficient-${Date.now()}` });
  const result = await localRepository.createOrder({ buyerId: `test-buyer-insufficient-${Date.now()}`, listingId: listing.id, quantityKg: 6, deliveryLocation: 'Buyer depot' });
  assert.deepEqual(result, { error: 'Requested quantity exceeds available quantity' });
});

test('Supabase integration tests require isolated test-only credentials', { skip: !process.env.SUPABASE_TEST_URL || !process.env.SUPABASE_TEST_SERVICE_ROLE_KEY }, async () => {
  assert.ok(process.env.SUPABASE_TEST_URL);
  assert.ok(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
});
