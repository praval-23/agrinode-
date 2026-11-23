import type { FarmerListing } from '@/types/listing';
import type { Order, OrderStatus } from '@/types/order';

export type OndcListing = Omit<FarmerListing, 'distanceKm' | 'dataSource'> & {
  availableQuantityKg: number;
};

export type OndcNetwork = {
  mode: string;
  integrated: false;
  message: string;
};

export type OndcCatalogItem = {
  providerId: string;
  itemId: string;
  descriptor: string;
  pricePerKg: number;
  availableQuantityKg: number;
};

export type OndcSearchResponse = {
  network: OndcNetwork;
  context: { action: 'search'; domain: string; query: Record<string, string> };
  catalog: OndcCatalogItem[];
  listings: OndcListing[];
  count: number;
};

export type OndcQuote = {
  quantityKg: number;
  pricePerKg: number;
  totalAmount: number;
  currency: string;
};

export type OndcSelectResponse = {
  network: OndcNetwork;
  context: { action: 'select'; itemId: string; providerId: string };
  provider: { id: string; type: string };
  item: OndcCatalogItem;
  fulfillment: { pickupLocation: string; deliveryLocationRequired: boolean };
  quote: OndcQuote;
};

export type OndcInitResponse = {
  network: OndcNetwork;
  context: { action: 'init'; transactionId: string };
  buyer: { id: string };
  item: OndcCatalogItem;
  quote: OndcQuote;
  fulfillment: { pickupLocation: string; deliveryLocation: string };
  nextAction: 'confirm';
};

export type OndcOrder = Omit<Order, 'paymentStatus'> & {
  paymentStatus: 'PENDING' | 'SETTLED_DEMO';
};

export type OndcSettlement = {
  id: string;
  orderId: string;
  totalAmount: number;
  farmerAmount: number;
  transporterAmount: number;
  serviceNodeAmount: number;
  status: 'CALCULATED' | 'PENDING' | 'COMPLETED' | 'FAILED';
  actualTransfer: false;
  createdAt: string;
};

export type OndcLogistics = {
  orderId: string;
  status: 'NOT_ASSIGNED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED';
  transporterId?: string;
  pickupLocation: string;
  deliveryLocation: string;
  provider: 'demo';
  routeStatus: 'NOT_CALCULATED' | 'DEMO_ROUTE';
  routeSummary?: string;
};

export type OndcConfirmResponse = {
  network: OndcNetwork;
  context: { action: 'confirm'; transactionId: string };
  order: OndcOrder;
  settlement: OndcSettlement;
  logistics: OndcLogistics;
  networkOrder: { orderId: string; itemId: string; buyerId: string; sellerId: string };
  networkStatus: 'Created' | 'Accepted' | 'In-progress' | 'Completed' | 'Cancelled';
};

export type OndcOrderStatusResponse = {
  network: OndcNetwork;
  orderId: string;
  status: 'Created' | 'Accepted' | 'In-progress' | 'Completed' | 'Cancelled';
  agrinodeStatus: OrderStatus;
  paymentStatus: 'PENDING' | 'SETTLED_DEMO';
  transportStatus: OndcLogistics['status'];
};

export type OndcTrackResponse = {
  network: OndcNetwork;
  orderId: string;
  status: OndcOrderStatusResponse['status'];
  fulfillment: {
    pickupLocation: string | null;
    deliveryLocation: string | null;
    transporterId: string | null;
    status: OndcLogistics['status'];
    routeStatus: OndcLogistics['routeStatus'];
    routeSummary: string | null;
    provider: 'demo';
  };
};