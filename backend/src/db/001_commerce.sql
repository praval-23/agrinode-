-- AgriNode commerce schema for Supabase PostgreSQL.
-- Authentication remains the existing prototype bearer-token system in this phase.
-- IDs intentionally remain text so existing farmer-ramesh/buyer-nila identities and
-- current REST contracts can migrate without an auth UUID migration.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id text primary key,
  role text not null check (role in ('farmer', 'buyer', 'transporter')),
  display_name text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id text primary key,
  farmer_id text not null references public.profiles(id),
  crop text not null,
  grade text not null,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  available_quantity_kg numeric(14, 3) not null check (available_quantity_kg >= 0),
  price_per_kg numeric(14, 2) not null check (price_per_kg > 0),
  harvest_date text not null,
  location text not null,
  description text not null default '',
  status text not null check (status in ('ACTIVE', 'RESERVED', 'SOLD', 'EXPIRED')),
  verified boolean not null default false,
  quality_score numeric(5, 2),
  quality_confidence numeric(5, 2),
  scan_source text check (scan_source is null or scan_source in ('gemini', 'mock')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_quantity_kg <= quantity_kg)
);

create table if not exists public.orders (
  id text primary key,
  buyer_id text not null references public.profiles(id),
  farmer_id text not null references public.profiles(id),
  listing_id text not null references public.listings(id),
  crop text not null,
  grade text not null,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  price_per_kg numeric(14, 2) not null check (price_per_kg > 0),
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  status text not null check (status in ('PLACED', 'ACCEPTED', 'PRODUCE_READY', 'PICKUP_ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED')),
  delivery_location text not null,
  payment_status text not null check (payment_status in ('PENDING', 'SETTLED_DEMO')),
  transport_status text not null check (transport_status in ('NOT_ASSIGNED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settlements (
  id text primary key,
  order_id text not null unique references public.orders(id),
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  farmer_amount numeric(14, 2) not null check (farmer_amount >= 0),
  transporter_amount numeric(14, 2) not null check (transporter_amount >= 0),
  service_node_amount numeric(14, 2) not null check (service_node_amount >= 0),
  status text not null check (status in ('CALCULATED', 'PENDING', 'COMPLETED', 'FAILED')),
  actual_transfer boolean not null default false check (actual_transfer = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (farmer_amount + transporter_amount + service_node_amount = total_amount)
);

create table if not exists public.logistics (
  order_id text primary key references public.orders(id),
  transporter_id text references public.profiles(id),
  status text not null check (status in ('NOT_ASSIGNED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED')),
  pickup_location text not null,
  delivery_location text not null,
  provider text not null default 'demo',
  route_status text not null check (route_status in ('NOT_CALCULATED', 'DEMO_ROUTE')),
  route_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_status_crop_created_idx on public.listings (status, crop, created_at desc);
create index if not exists listings_farmer_created_idx on public.listings (farmer_id, created_at desc);
create index if not exists orders_buyer_created_idx on public.orders (buyer_id, created_at desc);
create index if not exists orders_farmer_created_idx on public.orders (farmer_id, created_at desc);
create index if not exists orders_listing_idx on public.orders (listing_id);
create index if not exists settlements_order_idx on public.settlements (order_id);
create index if not exists settlements_status_idx on public.settlements (status);
create index if not exists logistics_transporter_idx on public.logistics (transporter_id);
create index if not exists logistics_status_idx on public.logistics (status);

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.settlements enable row level security;
alter table public.logistics enable row level security;

create or replace function public.reserve_listing_and_create_order(
  p_buyer_id text,
  p_listing_id text,
  p_quantity_kg numeric,
  p_delivery_location text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
  v_order public.orders%rowtype;
  v_settlement public.settlements%rowtype;
  v_logistics public.logistics%rowtype;
  v_total numeric(14, 2);
  v_farmer numeric(14, 2);
  v_transporter numeric(14, 2);
  v_service_node numeric(14, 2);
begin
  if p_quantity_kg is null or p_quantity_kg <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  select * into v_listing from public.listings where id = p_listing_id and status = 'ACTIVE' for update;
  if not found then raise exception 'LISTING_NOT_AVAILABLE'; end if;
  if v_listing.available_quantity_kg < p_quantity_kg then raise exception 'INSUFFICIENT_QUANTITY'; end if;

  v_total := round(p_quantity_kg * v_listing.price_per_kg, 2);
  v_farmer := round(v_total * 0.85, 2);
  v_transporter := round(v_total * 0.10, 2);
  v_service_node := v_total - v_farmer - v_transporter;

  update public.listings set available_quantity_kg = available_quantity_kg - p_quantity_kg, status = case when available_quantity_kg - p_quantity_kg = 0 then 'SOLD' else 'ACTIVE' end, updated_at = now() where id = p_listing_id;
  insert into public.orders (id, buyer_id, farmer_id, listing_id, crop, grade, quantity_kg, price_per_kg, total_amount, status, delivery_location, payment_status, transport_status)
  values ('ORD-' || gen_random_uuid(), p_buyer_id, v_listing.farmer_id, v_listing.id, v_listing.crop, v_listing.grade, p_quantity_kg, v_listing.price_per_kg, v_total, 'PLACED', p_delivery_location, 'PENDING', 'NOT_ASSIGNED') returning * into v_order;
  insert into public.settlements (id, order_id, total_amount, farmer_amount, transporter_amount, service_node_amount, status, actual_transfer)
  values ('SET-' || gen_random_uuid(), v_order.id, v_total, v_farmer, v_transporter, v_service_node, 'PENDING', false) returning * into v_settlement;
  insert into public.logistics (order_id, status, pickup_location, delivery_location, provider, route_status)
  values (v_order.id, 'NOT_ASSIGNED', v_listing.location, p_delivery_location, 'demo', 'NOT_CALCULATED') returning * into v_logistics;
  return jsonb_build_object('order', to_jsonb(v_order), 'settlement', to_jsonb(v_settlement), 'logistics', to_jsonb(v_logistics));
end;
$$;

revoke all on function public.reserve_listing_and_create_order(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.reserve_listing_and_create_order(text, text, numeric, text) to service_role;
