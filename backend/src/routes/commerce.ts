import { Router } from 'express';
import { authenticate, currentUser, type AuthUser } from '../middleware/auth';
import { commerceRepository } from '../repositories';
import { createDemoRoute } from '../services/routeProvider';
import type { ListingStatus, OrderStatus, Settlement } from '../types/commerce';

const router = Router();
const listingStatuses = new Set<ListingStatus>(['ACTIVE', 'RESERVED', 'SOLD', 'EXPIRED']);
const orderStatuses = new Set<OrderStatus>(['PLACED', 'ACCEPTED', 'PRODUCE_READY', 'PICKUP_ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED']);
const settlementStatuses = new Set<Settlement['status']>(['CALCULATED', 'PENDING', 'COMPLETED', 'FAILED']);
router.use((request, response, next) => {
  if (request.method === 'GET' && request.path.startsWith('/listings')) { next(); return; }
  authenticate(request, response, next);
});

function text(value: unknown, field: string, max = 200): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) return undefined;
  return value.trim();
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function canAccessOrder(user: AuthUser | undefined, order: Awaited<ReturnType<typeof commerceRepository.getOrder>>): boolean {
  return !user || (!!order && (order.buyerId === user.id || order.farmerId === user.id || user.role === 'transporter'));
}

router.get('/listings', async (request, response, next) => {
  try {
  const status = typeof request.query.status === 'string' ? request.query.status.toUpperCase() as ListingStatus : undefined;
  if (status && !listingStatuses.has(status)) { response.status(400).json({ error: 'Invalid listing status' }); return; }
  response.json({ listings: await commerceRepository.listListings(status) });
  } catch (error) { next(error); }
});

router.get('/listings/:id', async (request, response, next) => {
  try {
  const listing = await commerceRepository.getListing(request.params.id);
  if (!listing) { response.status(404).json({ error: 'Listing not found' }); return; }
  response.json({ listing });
  } catch (error) { next(error); }
});

router.patch('/listings/:id', async (request, response, next) => {
  try {
  const listing = await commerceRepository.getListing(request.params.id);
  if (!listing) { response.status(404).json({ error: 'Listing not found' }); return; }
  const user = currentUser(request);
  if (user && (user.role !== 'farmer' || user.id !== listing.farmerId)) { response.status(403).json({ error: 'Only the listing farmer can modify this listing' }); return; }
  const body = request.body as Record<string, unknown>;
  const patch = {
    ...(body.crop !== undefined && text(body.crop, 'crop', 80) ? { crop: text(body.crop, 'crop', 80) } : {}),
    ...(body.grade !== undefined && text(body.grade, 'grade', 30) ? { grade: text(body.grade, 'grade', 30) } : {}),
    ...(body.quantityKg !== undefined && positiveNumber(body.quantityKg) ? { quantityKg: positiveNumber(body.quantityKg) } : {}),
    ...(body.pricePerKg !== undefined && positiveNumber(body.pricePerKg) ? { pricePerKg: positiveNumber(body.pricePerKg) } : {}),
    ...(body.harvestDate !== undefined && text(body.harvestDate, 'harvestDate', 40) ? { harvestDate: text(body.harvestDate, 'harvestDate', 40) } : {}),
    ...(body.location !== undefined && text(body.location, 'location', 160) ? { location: text(body.location, 'location', 160) } : {}),
    ...(body.description !== undefined && typeof body.description === 'string' && body.description.length <= 500 ? { description: body.description.trim() } : {}),
  };
  if (Object.keys(patch).length === 0) { response.status(400).json({ error: 'At least one valid listing field is required' }); return; }
  response.json({ listing: await commerceRepository.updateListing(request.params.id, patch) });
  } catch (error) { next(error); }
});

router.post('/listings', async (request, response, next) => {
  try {
  const body = request.body as Record<string, unknown>;
  const user = currentUser(request);
  const requestedFarmerId = text(body.farmerId, 'farmerId', 80);
  if (user && user.role !== 'farmer') { response.status(403).json({ error: 'Only farmers can create listings' }); return; }
  if (user && requestedFarmerId && requestedFarmerId !== user.id) { response.status(403).json({ error: 'A farmer may only create listings for their own profile' }); return; }
  const farmerId = user?.id ?? requestedFarmerId;
  const crop = text(body.crop, 'crop', 80);
  const grade = text(body.grade, 'grade', 30);
  const quantityKg = positiveNumber(body.quantityKg);
  const pricePerKg = positiveNumber(body.pricePerKg);
  const harvestDate = text(body.harvestDate, 'harvestDate', 40);
  const location = text(body.location, 'location', 160);
  const description = text(body.description, 'description', 500) ?? '';
  if (!farmerId || !crop || !grade || !quantityKg || !pricePerKg || !harvestDate || !location) { response.status(400).json({ error: 'farmerId, crop, grade, positive quantityKg and pricePerKg, harvestDate, and location are required' }); return; }
  const qualityScore = body.qualityScore === undefined ? undefined : positiveNumber(body.qualityScore);
  const qualityConfidence = body.qualityConfidence === undefined ? undefined : positiveNumber(body.qualityConfidence);
  if ((qualityScore !== undefined && qualityScore > 100) || (qualityConfidence !== undefined && qualityConfidence > 100)) { response.status(400).json({ error: 'qualityScore and qualityConfidence must be at most 100' }); return; }
  const scanSource = body.scanSource === 'gemini' || body.scanSource === 'mock' ? body.scanSource : undefined;
  const listing = await commerceRepository.createListing({ farmerId, crop, grade, quantityKg, pricePerKg, harvestDate, location, description, ...(qualityScore !== undefined ? { qualityScore } : {}), ...(qualityConfidence !== undefined ? { qualityConfidence } : {}), ...(scanSource ? { scanSource } : {}) });
  response.status(201).json({ listing });
  } catch (error) { next(error); }
});

router.get('/orders', async (request, response, next) => {
  try {
  const user = currentUser(request);
  let buyerId = typeof request.query.buyerId === 'string' ? request.query.buyerId : undefined;
  let farmerId = typeof request.query.farmerId === 'string' ? request.query.farmerId : undefined;
  if (user?.role === 'buyer') { if (buyerId && buyerId !== user.id) { response.status(403).json({ error: 'Buyers may only view their own orders' }); return; } buyerId = user.id; farmerId = undefined; }
  if (user?.role === 'farmer') { if (farmerId && farmerId !== user.id) { response.status(403).json({ error: 'Farmers may only view their own orders' }); return; } farmerId = user.id; buyerId = undefined; }
  if (!buyerId && !farmerId) { response.status(400).json({ error: 'buyerId or farmerId is required' }); return; }
  response.json({ orders: await commerceRepository.listOrders({ buyerId, farmerId }) });
  } catch (error) { next(error); }
});

router.get('/orders/:id', async (request, response, next) => {
  try {
  const order = await commerceRepository.getOrder(request.params.id);
  if (!order) { response.status(404).json({ error: 'Order not found' }); return; }
  if (!canAccessOrder(currentUser(request), order)) { response.status(403).json({ error: 'You cannot access this order' }); return; }
  response.json({ order });
  } catch (error) { next(error); }
});

router.post('/orders', async (request, response, next) => {
  try {
  const body = request.body as Record<string, unknown>;
  const user = currentUser(request);
  if (user && user.role !== 'buyer') { response.status(403).json({ error: 'Only buyers can create orders' }); return; }
  const requestedBuyerId = text(body.buyerId, 'buyerId', 80);
  if (user && requestedBuyerId && requestedBuyerId !== user.id) { response.status(403).json({ error: 'A buyer may only create orders for their own profile' }); return; }
  const buyerId = user?.id ?? requestedBuyerId;
  const listingId = text(body.listingId, 'listingId', 100);
  const deliveryLocation = text(body.deliveryLocation, 'deliveryLocation', 200);
  const quantityKg = positiveNumber(body.quantityKg);
  if (!buyerId || !listingId || !deliveryLocation || !quantityKg) { response.status(400).json({ error: 'buyerId, listingId, positive quantityKg, and deliveryLocation are required' }); return; }
  const result = await commerceRepository.createOrder({ buyerId, listingId, quantityKg, deliveryLocation });
  if ('error' in result) { response.status(409).json({ error: result.error }); return; }
  response.status(201).json(result);
  } catch (error) { next(error); }
});

router.patch('/orders/:id/status', async (request, response, next) => {
  try {
  const existing = await commerceRepository.getOrder(request.params.id);
  if (!existing) { response.status(404).json({ error: 'Order not found' }); return; }
  const user = currentUser(request);
  if (user && user.role !== 'transporter' && user.id !== existing.farmerId) { response.status(403).json({ error: 'Only the assigned transporter or listing farmer can update order status' }); return; }
  const status = typeof request.body?.status === 'string' ? request.body.status.toUpperCase() as OrderStatus : undefined;
  if (!status || !orderStatuses.has(status)) { response.status(400).json({ error: 'Invalid order status' }); return; }
  const order = await commerceRepository.updateOrderStatus(request.params.id, status);
  if (!order) { response.status(404).json({ error: 'Order not found' }); return; }
  response.json({ order });
  } catch (error) { next(error); }
});

router.get('/orders/:id/settlement', async (request, response, next) => {
  try {
  const order = await commerceRepository.getOrder(request.params.id);
  if (!order) { response.status(404).json({ error: 'Order not found' }); return; }
  if (!canAccessOrder(currentUser(request), order)) { response.status(403).json({ error: 'You cannot access this settlement' }); return; }
  response.json({ settlement: await commerceRepository.getSettlement(request.params.id) });
  } catch (error) { next(error); }
});

router.patch('/orders/:id/settlement', async (request, response, next) => {
  try {
  const order = await commerceRepository.getOrder(request.params.id);
  if (!order) { response.status(404).json({ error: 'Order not found' }); return; }
  if (!canAccessOrder(currentUser(request), order)) { response.status(403).json({ error: 'You cannot update this settlement' }); return; }
  const status = typeof request.body?.status === 'string' ? request.body.status.toUpperCase() as Settlement['status'] : undefined;
  if (!status || !settlementStatuses.has(status)) { response.status(400).json({ error: 'Invalid settlement status' }); return; }
  const settlement = await commerceRepository.updateSettlementStatus(request.params.id, status);
  response.json({ settlement });
  } catch (error) { next(error); }
});

router.get('/orders/:id/logistics', async (request, response, next) => {
  try {
  const order = await commerceRepository.getOrder(request.params.id);
  if (!order) { response.status(404).json({ error: 'Order not found' }); return; }
  if (!canAccessOrder(currentUser(request), order)) { response.status(403).json({ error: 'You cannot access this logistics record' }); return; }
  response.json({ logistics: await commerceRepository.getLogistics(request.params.id) });
  } catch (error) { next(error); }
});

router.patch('/orders/:id/logistics', async (request, response, next) => {
  try {
  const order = await commerceRepository.getOrder(request.params.id);
  if (!order) { response.status(404).json({ error: 'Order not found' }); return; }
  const user = currentUser(request);
  if (user && user.role !== 'transporter' && user.id !== order.farmerId) { response.status(403).json({ error: 'Only the transporter or listing farmer can update logistics' }); return; }
  const transporterId = request.body?.transporterId === undefined ? undefined : text(request.body.transporterId, 'transporterId', 80);
  const status = typeof request.body?.status === 'string' ? request.body.status.toUpperCase() : undefined;
  const routeStatus: 'DEMO_ROUTE' | undefined = request.body?.routeStatus === 'DEMO_ROUTE' ? 'DEMO_ROUTE' : undefined;
  const updates = { ...(transporterId ? { transporterId } : {}), ...(status ? { status: status as 'NOT_ASSIGNED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' } : {}), ...(routeStatus ? { routeStatus, routeSummary: createDemoRoute() } : {}) };
  const logistics = await commerceRepository.updateLogistics(request.params.id, updates);
  response.json({ logistics });
  } catch (error) { next(error); }
});

export default router;