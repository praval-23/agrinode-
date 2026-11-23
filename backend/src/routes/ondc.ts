import { Router } from 'express';
import { ondcAdapter } from '../integrations/ondc';
import { authenticate, currentUser, type AuthUser } from '../middleware/auth';
import { commerceRepository } from '../repositories';
import type { Listing, Order } from '../types/commerce';

const router = Router();

function text(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function matchesSearch(listing: Listing, query: { crop?: string; grade?: string; location?: string }): boolean {
  const crop = normalize(query.crop);
  const grade = normalize(query.grade);
  const location = normalize(query.location);

  if (crop && !normalize(listing.crop).includes(crop)) return false;
  if (grade && !normalize(listing.grade).includes(grade)) return false;

  if (location) {
    const haystack = [listing.location, listing.crop, listing.grade, listing.description].map(normalize).join(' ');
    if (!haystack.includes(location)) return false;
  }

  return true;
}

function networkMeta() {
  return {
    mode: 'agrinode-ondc-style',
    integrated: false,
    message: 'Compatibility adapter only; live ONDC discovery, callbacks, signing, and network calls are not configured.',
  };
}

function canAccessOrder(user: AuthUser | undefined, order: Order): boolean {
  return !user || order.buyerId === user.id || order.farmerId === user.id || user.role === 'transporter';
}

router.post('/search', async (request, response, next) => {
  try {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const crop = text(body.crop, 80);
    const grade = text(body.grade, 30);
    const location = text(body.location, 160);
    const limitValue = body.limit === undefined ? 50 : Number(body.limit);

    if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
      response.status(400).json({ error: 'limit must be an integer between 1 and 100' });
      return;
    }

    const listings = await commerceRepository.listListings('ACTIVE');
    const matches = listings.filter((listing) => matchesSearch(listing, { crop, grade, location })).slice(0, limitValue);

    response.json({
      network: networkMeta(),
      context: {
        action: 'search',
        domain: 'agri-commerce',
        query: { ...(crop ? { crop } : {}), ...(grade ? { grade } : {}), ...(location ? { location } : {}) },
      },
      catalog: matches.map((listing) => ondcAdapter.mapListingToCatalog(listing)),
      listings: matches,
      count: matches.length,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/select', async (request, response, next) => {
  try {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const listingId = text(body.listingId, 100);
    const quantityKg = positiveNumber(body.quantityKg);

    if (!listingId || !quantityKg) {
      response.status(400).json({ error: 'listingId and positive quantityKg are required' });
      return;
    }

    const listing = await commerceRepository.getListing(listingId);
    if (!listing || listing.status !== 'ACTIVE') {
      response.status(404).json({ error: 'Listing is not available' });
      return;
    }

    if (quantityKg > listing.availableQuantityKg) {
      response.status(409).json({ error: 'Requested quantity exceeds available quantity' });
      return;
    }

    response.json({
      network: networkMeta(),
      context: { action: 'select', itemId: listing.id, providerId: listing.farmerId },
      provider: { id: listing.farmerId, type: 'farmer' },
      item: ondcAdapter.mapListingToCatalog(listing),
      fulfillment: { pickupLocation: listing.location, deliveryLocationRequired: true },
      quote: {
        quantityKg,
        pricePerKg: listing.pricePerKg,
        totalAmount: Math.round(quantityKg * listing.pricePerKg * 100) / 100,
        currency: 'INR',
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/init', authenticate, async (request, response, next) => {
  try {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const user = currentUser(request);
    if (user && user.role !== 'buyer') {
      response.status(403).json({ error: 'Only buyers can initialize an order' });
      return;
    }

    const listingId = text(body.listingId, 100);
    const quantityKg = positiveNumber(body.quantityKg);
    const deliveryLocation = text(body.deliveryLocation, 200);
    if (!listingId || !quantityKg || !deliveryLocation) {
      response.status(400).json({ error: 'listingId, positive quantityKg, and deliveryLocation are required' });
      return;
    }

    const listing = await commerceRepository.getListing(listingId);
    if (!listing || listing.status !== 'ACTIVE') {
      response.status(404).json({ error: 'Listing is not available' });
      return;
    }
    if (quantityKg > listing.availableQuantityKg) {
      response.status(409).json({ error: 'Requested quantity exceeds available quantity' });
      return;
    }

    const buyerId = user?.id ?? text(body.buyerId, 80);
    if (!buyerId) {
      response.status(400).json({ error: 'buyerId is required when authentication is disabled' });
      return;
    }
    if (user && body.buyerId !== undefined && text(body.buyerId, 80) !== user.id) {
      response.status(403).json({ error: 'A buyer may only initialize an order for their own profile' });
      return;
    }

    response.json({
      network: networkMeta(),
      context: { action: 'init', transactionId: `TXN-${crypto.randomUUID()}` },
      buyer: { id: buyerId },
      item: ondcAdapter.mapListingToCatalog(listing),
      quote: {
        quantityKg,
        pricePerKg: listing.pricePerKg,
        totalAmount: Math.round(quantityKg * listing.pricePerKg * 100) / 100,
        currency: 'INR',
      },
      fulfillment: { pickupLocation: listing.location, deliveryLocation },
      nextAction: 'confirm',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/confirm', authenticate, async (request, response, next) => {
  try {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const user = currentUser(request);
    if (user && user.role !== 'buyer') {
      response.status(403).json({ error: 'Only buyers can confirm an order' });
      return;
    }

    const listingId = text(body.listingId, 100);
    const quantityKg = positiveNumber(body.quantityKg);
    const deliveryLocation = text(body.deliveryLocation, 200);
    if (!listingId || !quantityKg || !deliveryLocation) {
      response.status(400).json({ error: 'listingId, positive quantityKg, and deliveryLocation are required' });
      return;
    }

    const buyerId = user?.id ?? text(body.buyerId, 80);
    if (!buyerId) {
      response.status(400).json({ error: 'buyerId is required when authentication is disabled' });
      return;
    }
    if (user && body.buyerId !== undefined && text(body.buyerId, 80) !== user.id) {
      response.status(403).json({ error: 'A buyer may only confirm an order for their own profile' });
      return;
    }

    const result = await commerceRepository.createOrder({ buyerId, listingId, quantityKg, deliveryLocation });
    if ('error' in result) {
      response.status(409).json({ error: result.error });
      return;
    }

    response.status(201).json({
      network: networkMeta(),
      context: { action: 'confirm', transactionId: `TXN-${crypto.randomUUID()}` },
      order: result.order,
      settlement: result.settlement,
      logistics: result.logistics,
      networkOrder: ondcAdapter.mapOrderToNetwork(result.order),
      networkStatus: ondcAdapter.mapOrderStatus(result.order.status),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:id/status', authenticate, async (request, response, next) => {
  try {
    const orderId = text(request.params.id, 100);
    if (!orderId) {
      response.status(400).json({ error: 'Order id is required' });
      return;
    }
    const order = await commerceRepository.getOrder(orderId);
    if (!order) {
      response.status(404).json({ error: 'Order not found' });
      return;
    }
    if (!canAccessOrder(currentUser(request), order)) {
      response.status(403).json({ error: 'You cannot access this order' });
      return;
    }

    response.json({
      network: networkMeta(),
      orderId: order.id,
      status: ondcAdapter.mapOrderStatus(order.status),
      agrinodeStatus: order.status,
      paymentStatus: order.paymentStatus,
      transportStatus: order.transportStatus,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:id/track', authenticate, async (request, response, next) => {
  try {
    const orderId = text(request.params.id, 100);
    if (!orderId) {
      response.status(400).json({ error: 'Order id is required' });
      return;
    }
    const order = await commerceRepository.getOrder(orderId);
    if (!order) {
      response.status(404).json({ error: 'Order not found' });
      return;
    }
    if (!canAccessOrder(currentUser(request), order)) {
      response.status(403).json({ error: 'You cannot access this order' });
      return;
    }

    const logistics = await commerceRepository.getLogistics(order.id);
    response.json({
      network: networkMeta(),
      orderId: order.id,
      status: ondcAdapter.mapOrderStatus(order.status),
      fulfillment: {
        pickupLocation: logistics?.pickupLocation ?? null,
        deliveryLocation: logistics?.deliveryLocation ?? order.deliveryLocation,
        transporterId: logistics?.transporterId ?? null,
        status: logistics?.status ?? order.transportStatus,
        routeStatus: logistics?.routeStatus ?? 'NOT_CALCULATED',
        routeSummary: logistics?.routeSummary ?? null,
        provider: logistics?.provider ?? 'demo',
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;