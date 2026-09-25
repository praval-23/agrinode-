import type { PostgrestError } from '@supabase/supabase-js';
import type { CommerceRepository, CreateListingInput, CreateOrderInput } from '../services/commerceRepository.types';
import type { Listing, Logistics, Order, OrderStatus, Settlement } from '../types/commerce';
import { getSupabaseClient } from './supabaseClient';

type Row = Record<string, unknown>;

function fail(error: PostgrestError | null, operation: string): never {
  if (error) throw new Error(`Supabase ${operation} failed: ${error.message}`);
  throw new Error(`Supabase ${operation} failed`);
}

function requiredString(row: Row, key: string): string { return String(row[key] ?? ''); }
function numberValue(row: Row, key: string): number { return Number(row[key] ?? 0); }

function mapListing(row: Row): Listing {
  return {
    id: requiredString(row, 'id'), farmerId: requiredString(row, 'farmer_id'), crop: requiredString(row, 'crop'), grade: requiredString(row, 'grade'),
    quantityKg: numberValue(row, 'quantity_kg'), availableQuantityKg: numberValue(row, 'available_quantity_kg'), pricePerKg: numberValue(row, 'price_per_kg'),
    harvestDate: requiredString(row, 'harvest_date'), location: requiredString(row, 'location'), description: requiredString(row, 'description'),
    status: row.status as Listing['status'], createdAt: requiredString(row, 'created_at'), verified: Boolean(row.verified),
    qualityScore: row.quality_score === null || row.quality_score === undefined ? undefined : numberValue(row, 'quality_score'),
    qualityConfidence: row.quality_confidence === null || row.quality_confidence === undefined ? undefined : numberValue(row, 'quality_confidence'),
    scanSource: row.scan_source === 'gemini' || row.scan_source === 'mock' ? row.scan_source : undefined,
  };
}

function mapOrder(row: Row): Order {
  return {
    id: requiredString(row, 'id'), buyerId: requiredString(row, 'buyer_id'), farmerId: requiredString(row, 'farmer_id'), listingId: requiredString(row, 'listing_id'),
    crop: requiredString(row, 'crop'), quantityKg: numberValue(row, 'quantity_kg'), pricePerKg: numberValue(row, 'price_per_kg'), totalAmount: numberValue(row, 'total_amount'),
    status: row.status as OrderStatus, createdAt: requiredString(row, 'created_at'), deliveryLocation: requiredString(row, 'delivery_location'),
    paymentStatus: row.payment_status as Order['paymentStatus'], transportStatus: row.transport_status as Order['transportStatus'], grade: requiredString(row, 'grade'),
  };
}

function mapSettlement(row: Row): Settlement {
  return { id: requiredString(row, 'id'), orderId: requiredString(row, 'order_id'), totalAmount: numberValue(row, 'total_amount'), farmerAmount: numberValue(row, 'farmer_amount'), transporterAmount: numberValue(row, 'transporter_amount'), serviceNodeAmount: numberValue(row, 'service_node_amount'), status: row.status as Settlement['status'], actualTransfer: false, createdAt: requiredString(row, 'created_at') };
}

function mapLogistics(row: Row): Logistics {
  return { orderId: requiredString(row, 'order_id'), status: row.status as Logistics['status'], transporterId: row.transporter_id ? String(row.transporter_id) : undefined, pickupLocation: requiredString(row, 'pickup_location'), deliveryLocation: requiredString(row, 'delivery_location'), provider: 'demo', routeStatus: row.route_status as Logistics['routeStatus'], routeSummary: row.route_summary ? String(row.route_summary) : undefined };
}

export class SupabaseCommerceRepository implements CommerceRepository {
  private get client() { return getSupabaseClient(); }

  private async ensureProfile(id: string, role: 'farmer' | 'buyer' | 'transporter'): Promise<void> {
    const { error } = await this.client.from('profiles').upsert({ id, role }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) fail(error, 'profile upsert');
  }

  async listListings(status?: Listing['status']): Promise<Listing[]> {
    let query = this.client.from('listings').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) fail(error, 'list listings');
    return (data ?? []).map((row) => mapListing(row as Row));
  }

  async getListing(listingId: string): Promise<Listing | undefined> {
    const { data, error } = await this.client.from('listings').select('*').eq('id', listingId).maybeSingle();
    if (error) fail(error, 'get listing');
    return data ? mapListing(data as Row) : undefined;
  }

  async createListing(input: CreateListingInput): Promise<Listing> {
    await this.ensureProfile(input.farmerId, 'farmer');
    const row = { ...input, available_quantity_kg: input.quantityKg, status: 'ACTIVE', verified: false };
    const { data, error } = await this.client.from('listings').insert({ id: `LST-${crypto.randomUUID()}`, farmer_id: input.farmerId, crop: input.crop, grade: input.grade, quantity_kg: input.quantityKg, available_quantity_kg: input.quantityKg, price_per_kg: input.pricePerKg, harvest_date: input.harvestDate, location: input.location, description: input.description, status: 'ACTIVE', verified: false, quality_score: input.qualityScore ?? null, quality_confidence: input.qualityConfidence ?? null, scan_source: input.scanSource ?? null }).select().single();
    void row;
    if (error || !data) fail(error, 'create listing');
    return mapListing(data as Row);
  }

  async updateListing(listingId: string, patch: Partial<Pick<Listing, 'crop' | 'grade' | 'quantityKg' | 'pricePerKg' | 'harvestDate' | 'location' | 'description'>>): Promise<Listing | undefined> {
    const update: Row = {};
    if (patch.crop !== undefined) update.crop = patch.crop;
    if (patch.grade !== undefined) update.grade = patch.grade;
    if (patch.quantityKg !== undefined) update.quantity_kg = patch.quantityKg;
    if (patch.pricePerKg !== undefined) update.price_per_kg = patch.pricePerKg;
    if (patch.harvestDate !== undefined) update.harvest_date = patch.harvestDate;
    if (patch.location !== undefined) update.location = patch.location;
    if (patch.description !== undefined) update.description = patch.description;
    const { data, error } = await this.client.from('listings').update(update).eq('id', listingId).select().maybeSingle();
    if (error) fail(error, 'update listing');
    return data ? mapListing(data as Row) : undefined;
  }

  async listOrders(filters: { buyerId?: string; farmerId?: string }): Promise<Order[]> {
    let query = this.client.from('orders').select('*').order('created_at', { ascending: false });
    if (filters.buyerId) query = query.eq('buyer_id', filters.buyerId);
    if (filters.farmerId) query = query.eq('farmer_id', filters.farmerId);
    const { data, error } = await query;
    if (error) fail(error, 'list orders');
    return (data ?? []).map((row) => mapOrder(row as Row));
  }

  async getOrder(orderId: string): Promise<Order | undefined> {
    const { data, error } = await this.client.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error) fail(error, 'get order');
    return data ? mapOrder(data as Row) : undefined;
  }

  async createOrder(input: CreateOrderInput): Promise<{ order: Order; settlement: Settlement; logistics: Logistics } | { error: string }> {
    await this.ensureProfile(input.buyerId, 'buyer');
    const { data, error } = await this.client.rpc('reserve_listing_and_create_order', { p_buyer_id: input.buyerId, p_listing_id: input.listingId, p_quantity_kg: input.quantityKg, p_delivery_location: input.deliveryLocation });
    if (error) {
      if (error.message.includes('LISTING_NOT_AVAILABLE') || error.message.includes('INSUFFICIENT_QUANTITY')) return { error: error.message };
      fail(error, 'create order');
    }
    const result = data as { order: Row; settlement: Row; logistics: Row };
    return { order: mapOrder(result.order), settlement: mapSettlement(result.settlement), logistics: mapLogistics(result.logistics) };
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | undefined> {
    const transportStatus = status === 'PICKUP_ASSIGNED' ? 'ASSIGNED' : status === 'IN_TRANSIT' ? 'IN_TRANSIT' : status === 'DELIVERED' ? 'DELIVERED' : undefined;
    const update: Row = { status, ...(transportStatus ? { transport_status: transportStatus } : {}), ...(status === 'COMPLETED' ? { payment_status: 'SETTLED_DEMO' } : {}) };
    const { data, error } = await this.client.from('orders').update(update).eq('id', orderId).select().maybeSingle();
    if (error) fail(error, 'update order status');
    if (!data) return undefined;
    if (transportStatus) await this.client.from('logistics').update({ status: transportStatus }).eq('order_id', orderId);
    return mapOrder(data as Row);
  }

  async getSettlement(orderId: string): Promise<Settlement | undefined> {
    const { data, error } = await this.client.from('settlements').select('*').eq('order_id', orderId).maybeSingle();
    if (error) fail(error, 'get settlement');
    return data ? mapSettlement(data as Row) : undefined;
  }

  async getLogistics(orderId: string): Promise<Logistics | undefined> {
    const { data, error } = await this.client.from('logistics').select('*').eq('order_id', orderId).maybeSingle();
    if (error) fail(error, 'get logistics');
    return data ? mapLogistics(data as Row) : undefined;
  }

  async updateSettlementStatus(orderId: string, status: Settlement['status']): Promise<Settlement | undefined> {
    const { data, error } = await this.client.from('settlements').update({ status }).eq('order_id', orderId).select().maybeSingle();
    if (error) fail(error, 'update settlement');
    return data ? mapSettlement(data as Row) : undefined;
  }

  async updateLogistics(orderId: string, update: Partial<Pick<Logistics, 'status' | 'transporterId' | 'routeStatus' | 'routeSummary'>>): Promise<Logistics | undefined> {
    const row = { ...(update.status ? { status: update.status } : {}), ...(update.transporterId ? { transporter_id: update.transporterId } : {}), ...(update.routeStatus ? { route_status: update.routeStatus } : {}), ...(update.routeSummary ? { route_summary: update.routeSummary } : {}) };
    const { data, error } = await this.client.from('logistics').update(row).eq('order_id', orderId).select().maybeSingle();
    if (error) fail(error, 'update logistics');
    return data ? mapLogistics(data as Row) : undefined;
  }
}
