import {
    createListing,
    createOrder,
    getListing,
    getLogistics,
    getOrder,
    getSettlement,
    listListings,
    listOrders,
    updateListing,
    updateLogistics,
    updateOrderStatus,
    updateSettlementStatus,
} from '../services/commerceRepository';
import type { CommerceRepository } from '../services/commerceRepository.types';

export class LocalJsonCommerceRepository implements CommerceRepository {
  listListings(status?: Parameters<typeof listListings>[0]) { return Promise.resolve(listListings(status)); }
  getListing(listingId: string) { return Promise.resolve(getListing(listingId)); }
  createListing(input: Parameters<typeof createListing>[0]) { return Promise.resolve(createListing(input)); }
  updateListing(listingId: string, patch: Parameters<typeof updateListing>[1]) { return Promise.resolve(updateListing(listingId, patch)); }
  listOrders(filters: Parameters<typeof listOrders>[0]) { return Promise.resolve(listOrders(filters)); }
  getOrder(orderId: string) { return Promise.resolve(getOrder(orderId)); }
  createOrder(input: Parameters<typeof createOrder>[0]) { return Promise.resolve(createOrder(input)); }
  updateOrderStatus(orderId: string, status: Parameters<typeof updateOrderStatus>[1]) { return Promise.resolve(updateOrderStatus(orderId, status)); }
  getSettlement(orderId: string) { return Promise.resolve(getSettlement(orderId)); }
  getLogistics(orderId: string) { return Promise.resolve(getLogistics(orderId)); }
  updateSettlementStatus(orderId: string, status: Parameters<typeof updateSettlementStatus>[1]) { return Promise.resolve(updateSettlementStatus(orderId, status)); }
  updateLogistics(orderId: string, update: Parameters<typeof updateLogistics>[1]) { return Promise.resolve(updateLogistics(orderId, update)); }
}
