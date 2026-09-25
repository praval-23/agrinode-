import type { Listing, Order, OrderStatus } from '../types/commerce';

export type OndcCatalogItem = { providerId: string; itemId: string; descriptor: string; pricePerKg: number; availableQuantityKg: number };
export type OndcOrderStatus = 'Created' | 'Accepted' | 'In-progress' | 'Completed' | 'Cancelled';

export interface OndcAdapter {
  mapListingToCatalog(listing: Listing): OndcCatalogItem;
  mapOrderToNetwork(order: Order): { orderId: string; itemId: string; buyerId: string; sellerId: string };
  mapOrderStatus(status: OrderStatus): OndcOrderStatus;
  syncOrder(order: Order): Promise<{ integrated: false; reason: string }>;
}

/** Integration-ready mapping boundary. No ONDC network calls are made by this prototype. */
export const ondcAdapter: OndcAdapter = {
  mapListingToCatalog: (listing) => ({ providerId: listing.farmerId, itemId: listing.id, descriptor: listing.crop, pricePerKg: listing.pricePerKg, availableQuantityKg: listing.availableQuantityKg }),
  mapOrderToNetwork: (order) => ({ orderId: order.id, itemId: order.listingId, buyerId: order.buyerId, sellerId: order.farmerId }),
  mapOrderStatus: (status) => status === 'CANCELLED' ? 'Cancelled' : status === 'COMPLETED' ? 'Completed' : status === 'PLACED' ? 'Created' : status === 'DELIVERED' ? 'Completed' : status === 'IN_TRANSIT' ? 'In-progress' : 'Accepted',
  syncOrder: async () => ({ integrated: false, reason: 'ONDC network credentials and callbacks are not configured' }),
};