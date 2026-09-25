import type { Listing, Logistics, Order, OrderStatus, Settlement } from '../types/commerce';

export type CreateListingInput = Omit<Listing, 'id' | 'availableQuantityKg' | 'status' | 'createdAt' | 'verified'>;
export type CreateOrderInput = { buyerId: string; listingId: string; quantityKg: number; deliveryLocation: string };

export interface CommerceRepository {
  listListings(status?: Listing['status']): Promise<Listing[]>;
  getListing(listingId: string): Promise<Listing | undefined>;
  createListing(input: CreateListingInput): Promise<Listing>;
  updateListing(listingId: string, patch: Partial<Pick<Listing, 'crop' | 'grade' | 'quantityKg' | 'pricePerKg' | 'harvestDate' | 'location' | 'description'>>): Promise<Listing | undefined>;
  listOrders(filters: { buyerId?: string; farmerId?: string }): Promise<Order[]>;
  getOrder(orderId: string): Promise<Order | undefined>;
  createOrder(input: CreateOrderInput): Promise<{ order: Order; settlement: Settlement; logistics: Logistics } | { error: string }>;
  updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | undefined>;
  getSettlement(orderId: string): Promise<Settlement | undefined>;
  getLogistics(orderId: string): Promise<Logistics | undefined>;
  updateSettlementStatus(orderId: string, status: Settlement['status']): Promise<Settlement | undefined>;
  updateLogistics(orderId: string, update: Partial<Pick<Logistics, 'status' | 'transporterId' | 'routeStatus' | 'routeSummary'>>): Promise<Logistics | undefined>;
}