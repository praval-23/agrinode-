import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CommerceState, Listing, Logistics, Order, OrderStatus, Settlement } from '../types/commerce';

const statePath = join(process.cwd(), 'data', 'agri-state.json');
const emptyState: CommerceState = { listings: [], orders: [], settlements: [], logistics: [] };

function loadState(): CommerceState {
  try {
    if (!existsSync(statePath)) return structuredClone(emptyState);
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<CommerceState>;
    return { listings: parsed.listings ?? [], orders: parsed.orders ?? [], settlements: parsed.settlements ?? [], logistics: parsed.logistics ?? [] };
  } catch {
    return structuredClone(emptyState);
  }
}

let state = loadState();

function persist(): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function id(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export function listListings(status?: Listing['status']): Listing[] {
  return state.listings.filter((listing) => !status || listing.status === status);
}

export function getListing(listingId: string): Listing | undefined { return state.listings.find((listing) => listing.id === listingId); }

export function createListing(input: Omit<Listing, 'id' | 'availableQuantityKg' | 'status' | 'createdAt' | 'verified'>): Listing {
  const listing: Listing = { ...input, id: id('LST'), availableQuantityKg: input.quantityKg, status: 'ACTIVE', createdAt: new Date().toISOString(), verified: false };
  state.listings.unshift(listing);
  persist();
  return listing;
}

export function updateListing(listingId: string, patch: Partial<Pick<Listing, 'crop' | 'grade' | 'quantityKg' | 'pricePerKg' | 'harvestDate' | 'location' | 'description'>>): Listing | undefined {
  const listing = getListing(listingId);
  if (!listing) return undefined;
  Object.assign(listing, patch);
  if (patch.quantityKg !== undefined) listing.availableQuantityKg = Math.min(listing.availableQuantityKg, patch.quantityKg);
  persist();
  return listing;
}

export function listOrders(filters: { buyerId?: string; farmerId?: string }): Order[] {
  return state.orders.filter((order) => (!filters.buyerId || order.buyerId === filters.buyerId) && (!filters.farmerId || order.farmerId === filters.farmerId));
}

export function getOrder(orderId: string): Order | undefined { return state.orders.find((order) => order.id === orderId); }

export function createOrder(input: { buyerId: string; listingId: string; quantityKg: number; deliveryLocation: string }): { order: Order; settlement: Settlement; logistics: Logistics } | { error: string } {
  const listing = getListing(input.listingId);
  if (!listing || listing.status !== 'ACTIVE') return { error: 'Listing is not available' };
  if (input.quantityKg > listing.availableQuantityKg) return { error: 'Requested quantity exceeds available quantity' };
  listing.availableQuantityKg -= input.quantityKg;
  if (listing.availableQuantityKg === 0) listing.status = 'SOLD';
  const totalAmount = Math.round(input.quantityKg * listing.pricePerKg * 100) / 100;
  const order: Order = { id: id('ORD'), buyerId: input.buyerId, farmerId: listing.farmerId, listingId: listing.id, crop: listing.crop, quantityKg: input.quantityKg, pricePerKg: listing.pricePerKg, totalAmount, status: 'PLACED', createdAt: new Date().toISOString(), deliveryLocation: input.deliveryLocation, paymentStatus: 'PENDING', transportStatus: 'NOT_ASSIGNED', grade: listing.grade };
  const settlement: Settlement = { id: id('SET'), orderId: order.id, totalAmount, farmerAmount: round(totalAmount * 0.85), transporterAmount: round(totalAmount * 0.10), serviceNodeAmount: round(totalAmount - round(totalAmount * 0.85) - round(totalAmount * 0.10)), status: 'PENDING', actualTransfer: false, createdAt: new Date().toISOString() };
  const logistics: Logistics = { orderId: order.id, status: 'NOT_ASSIGNED', pickupLocation: listing.location, deliveryLocation: input.deliveryLocation, provider: 'demo', routeStatus: 'NOT_CALCULATED' };
  state.orders.unshift(order); state.settlements.unshift(settlement); state.logistics.unshift(logistics); persist();
  return { order, settlement, logistics };
}

function round(value: number): number { return Math.round(value * 100) / 100; }

export function updateOrderStatus(orderId: string, status: OrderStatus): Order | undefined {
  const order = getOrder(orderId);
  if (!order) return undefined;
  order.status = status;
  if (status === 'PICKUP_ASSIGNED') order.transportStatus = 'ASSIGNED';
  if (status === 'IN_TRANSIT') order.transportStatus = 'IN_TRANSIT';
  if (status === 'DELIVERED') order.transportStatus = 'DELIVERED';
  if (status === 'COMPLETED') order.paymentStatus = 'SETTLED_DEMO';
  const shipment = state.logistics.find((item) => item.orderId === orderId);
  if (shipment) shipment.status = order.transportStatus;
  persist();
  return order;
}

export function getSettlement(orderId: string): Settlement | undefined { return state.settlements.find((item) => item.orderId === orderId); }
export function getLogistics(orderId: string): Logistics | undefined { return state.logistics.find((item) => item.orderId === orderId); }

export function updateSettlementStatus(orderId: string, status: Settlement['status']): Settlement | undefined {
  const settlement = getSettlement(orderId);
  if (!settlement) return undefined;
  settlement.status = status;
  persist();
  return settlement;
}

export function updateLogistics(orderId: string, update: Partial<Pick<Logistics, 'status' | 'transporterId' | 'routeStatus' | 'routeSummary'>>): Logistics | undefined {
  const logistics = getLogistics(orderId);
  if (!logistics) return undefined;
  Object.assign(logistics, update);
  persist();
  return logistics;
}
