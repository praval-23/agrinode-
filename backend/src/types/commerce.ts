export type ListingStatus = 'ACTIVE' | 'RESERVED' | 'SOLD' | 'EXPIRED';
export type OrderStatus = 'PLACED' | 'ACCEPTED' | 'PRODUCE_READY' | 'PICKUP_ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'SETTLED_DEMO';
export type TransportStatus = 'NOT_ASSIGNED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED';

export type Listing = {
  id: string;
  farmerId: string;
  crop: string;
  grade: string;
  quantityKg: number;
  availableQuantityKg: number;
  pricePerKg: number;
  harvestDate: string;
  location: string;
  description: string;
  status: ListingStatus;
  createdAt: string;
  verified: boolean;
  qualityScore?: number;
  qualityConfidence?: number;
  scanSource?: 'gemini' | 'mock';
};

export type Order = {
  id: string;
  buyerId: string;
  farmerId: string;
  listingId: string;
  crop: string;
  quantityKg: number;
  pricePerKg: number;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  deliveryLocation: string;
  paymentStatus: PaymentStatus;
  transportStatus: TransportStatus;
  grade: string;
};

export type Settlement = {
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

export type Logistics = {
  orderId: string;
  status: TransportStatus;
  transporterId?: string;
  pickupLocation: string;
  deliveryLocation: string;
  provider: 'demo';
  routeStatus: 'NOT_CALCULATED' | 'DEMO_ROUTE';
  routeSummary?: string;
};

export type CommerceState = {
  listings: Listing[];
  orders: Order[];
  settlements: Settlement[];
  logistics: Logistics[];
};