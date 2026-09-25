import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSupabaseClient } from '../src/repositories/supabaseClient';
import type { CommerceState, Listing, Logistics, Order, Settlement } from '../src/types/commerce';

type Profile = { id: string; role: 'farmer' | 'buyer' | 'transporter' };

async function main(): Promise<void> {
  const statePath = join(process.cwd(), 'data', 'agri-state.json');
  if (!existsSync(statePath)) throw new Error(`JSON state file not found: ${statePath}`);
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as CommerceState;
  const client = getSupabaseClient();

const profiles = new Map<string, Profile>();
for (const listing of state.listings) profiles.set(listing.farmerId, { id: listing.farmerId, role: 'farmer' });
for (const order of state.orders) {
  profiles.set(order.buyerId, { id: order.buyerId, role: 'buyer' });
  profiles.set(order.farmerId, { id: order.farmerId, role: 'farmer' });
}
for (const logistics of state.logistics) {
  if (logistics.transporterId) profiles.set(logistics.transporterId, { id: logistics.transporterId, role: 'transporter' });
}

  async function upsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: table === 'logistics' ? 'order_id' : 'id' });
  if (error) throw new Error(`Supabase import failed for ${table}: ${error.message}`);
}

  await upsert('profiles', [...profiles.values()]);
  await upsert('listings', state.listings.map((item: Listing) => ({ id: item.id, farmer_id: item.farmerId, crop: item.crop, grade: item.grade, quantity_kg: item.quantityKg, available_quantity_kg: item.availableQuantityKg, price_per_kg: item.pricePerKg, harvest_date: item.harvestDate, location: item.location, description: item.description, status: item.status, verified: item.verified, quality_score: item.qualityScore ?? null, quality_confidence: item.qualityConfidence ?? null, scan_source: item.scanSource ?? null, created_at: item.createdAt })));
  await upsert('orders', state.orders.map((item: Order) => ({ id: item.id, buyer_id: item.buyerId, farmer_id: item.farmerId, listing_id: item.listingId, crop: item.crop, grade: item.grade, quantity_kg: item.quantityKg, price_per_kg: item.pricePerKg, total_amount: item.totalAmount, status: item.status, created_at: item.createdAt, delivery_location: item.deliveryLocation, payment_status: item.paymentStatus, transport_status: item.transportStatus })));
  await upsert('settlements', state.settlements.map((item: Settlement) => ({ id: item.id, order_id: item.orderId, total_amount: item.totalAmount, farmer_amount: item.farmerAmount, transporter_amount: item.transporterAmount, service_node_amount: item.serviceNodeAmount, status: item.status, actual_transfer: false, created_at: item.createdAt })));
  await upsert('logistics', state.logistics.map((item: Logistics) => ({ order_id: item.orderId, status: item.status, transporter_id: item.transporterId ?? null, pickup_location: item.pickupLocation, delivery_location: item.deliveryLocation, provider: item.provider, route_status: item.routeStatus, route_summary: item.routeSummary ?? null })));

  console.log(JSON.stringify({ imported: { profiles: profiles.size, listings: state.listings.length, orders: state.orders.length, settlements: state.settlements.length, logistics: state.logistics.length } }));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Supabase import failed');
  process.exitCode = 1;
});
