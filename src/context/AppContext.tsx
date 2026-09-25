import { DEMO_USER_IDS } from '@/constants/demoUsers';
import { listings as seedListings, notifications as seedNotifications, orders as seedOrders } from '@/data/mockData';
import { getApi, patchApi, postApi } from '@/services/apiClient';
import { mapBackendListing } from '@/services/listingApi';
import { updateListing as editListing, createListing as makeListing, deleteListing as removeListing } from '@/services/listingService';
import { createNotification } from '@/services/notificationService';
import { updateOrderStatus as progressOrder } from '@/services/orderService';
import type { AppNotification, AppRole } from '@/types/app';
import type { FarmerListing } from '@/types/listing';
import type { Order, OrderStatus } from '@/types/order';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

const initialListings: FarmerListing[] = seedListings.map((item) => ({
  id: item.id,
  farmerId: DEMO_USER_IDS.farmer,
  crop: item.crop,
  grade: item.grade,
  quantityKg: Number.parseInt(item.quantity),
  pricePerKg: item.price / 100,
  harvestDate: item.harvestDate,
  location: item.location,
  description: item.description,
  status: 'ACTIVE',
  createdAt: '2026-09-09T10:00:00.000Z',
  verified: true,
  distanceKm: Number.parseInt(item.distance),
}));

const initialOrders: Order[] = seedOrders.map((item) => {
  const quantityKg = Number.parseInt(item.quantity) * (item.quantity.includes('tonne') ? 1000 : 1);
  return {
    id: item.id,
    buyerId: DEMO_USER_IDS.buyer,
    farmerId: DEMO_USER_IDS.farmer,
    listingId: 'tomato-a',
    crop: item.crop,
    quantityKg,
    pricePerKg: item.amount / quantityKg,
    totalAmount: item.amount,
    status: item.status === 'Delivered' ? 'DELIVERED' : item.status === 'In Transit' ? 'IN_TRANSIT' : 'PLACED',
    createdAt: '2026-09-09T10:00:00.000Z',
    deliveryLocation: 'Bengaluru, Karnataka',
    paymentStatus: 'PENDING',
    transportStatus: item.status === 'Delivered' ? 'DELIVERED' : item.status === 'In Transit' ? 'IN_TRANSIT' : 'NOT_ASSIGNED',
    grade: item.grade,
  };
});

type AppState = {
  role: AppRole;
  setRole: (role: AppRole) => void;
  listings: FarmerListing[];
  listingsLoading: boolean;
  listingsError?: string;
  refreshListings: () => Promise<void>;
  createListing: (input: Omit<FarmerListing, 'id' | 'createdAt' | 'status' | 'verified' | 'distanceKm'>) => Promise<boolean>;
  updateListing: (id: string, patch: Partial<FarmerListing>) => void;
  deleteListing: (id: string) => void;
  orders: Order[];
  placeOrder: (listing: FarmerListing) => Promise<boolean>;
  advanceOrder: (id: string, status: OrderStatus) => void;
  notifications: AppNotification[];
  markNotificationRead: (id: string) => void;
};

const Context = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<AppRole>('farmer');
  const [listings, setListings] = useState<FarmerListing[]>(initialListings.map((item) => ({ ...item, dataSource: 'local' as const })));
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsError, setListingsError] = useState<string>();
  const [orders, setOrders] = useState(initialOrders);
  const [notifications, setNotifications] = useState<AppNotification[]>(seedNotifications.map((message, index) => ({
    id: `seed-${index}`,
    type: index === 0 ? 'ORDER' : index === 1 ? 'TRANSPORT' : index === 2 ? 'PAYMENT' : 'PRICE',
    title: 'AgriNode update',
    message,
    read: false,
    createdAt: '2026-09-09T10:00:00.000Z',
  })));

  const addNotice = (type: AppNotification['type'], title: string, message: string) => {
    setNotifications((all) => [createNotification(type, title, message), ...all]);
  };

  const refreshListings = async () => {
    setListingsLoading(true);
    try {
      const response = await getApi<{ listings: Parameters<typeof mapBackendListing>[0][] }>('/api/listings?status=ACTIVE');
      setListings(response.listings.map(mapBackendListing));
      setListingsError(undefined);
    } catch (error) {
      setListingsError(error instanceof Error ? error.message : 'Backend listings unavailable');
    } finally {
      setListingsLoading(false);
    }
  };

  const refreshOrders = async (currentRole: AppRole) => {
    try {
      const queryKey = currentRole === 'farmer' ? 'farmerId' : 'buyerId';
      const response = await getApi<{ orders: Order[] }>(`/api/orders?${queryKey}=${DEMO_USER_IDS[currentRole]}`);
      setOrders(response.orders);
    } catch {
      // Seed orders remain available when the backend is unavailable.
    }
  };

  useEffect(() => {
    void refreshListings();
    void refreshOrders(role);
  }, [role]);

  const value = useMemo<AppState>(() => ({
    role,
    setRole,
    listings,
    listingsLoading,
    listingsError,
    refreshListings,
    createListing: async (input) => {
      const localDraft = makeListing(input);
      try {
        const response = await postApi<{ listing: Parameters<typeof mapBackendListing>[0] }>('/api/listings', localDraft);
        setListings((all) => [mapBackendListing(response.listing), ...all.filter((item) => item.id !== localDraft.id)]);
        addNotice('SYSTEM', 'Listing created', `${localDraft.crop} is now active in the marketplace.`);
        return true;
      } catch (error) {
        addNotice('SYSTEM', 'Listing not published', error instanceof Error ? error.message : 'Backend listing request failed');
        return false;
      }
    },
    updateListing: (id, patch) => setListings((all) => editListing(all, id, patch)),
    deleteListing: (id) => setListings((all) => removeListing(all, id)),
    orders,
    placeOrder: async (listing) => {
      if (listing.dataSource !== 'backend') return false;
      try {
        const response = await postApi<{ order: Order }>('/api/orders', {
          buyerId: DEMO_USER_IDS.buyer,
          listingId: listing.id,
          quantityKg: listing.availableQuantityKg ?? listing.quantityKg,
          deliveryLocation: 'Bengaluru, Karnataka',
        });
        setOrders((all) => [response.order, ...all]);
        setListings((all) => editListing(all, listing.id, { status: 'RESERVED', availableQuantityKg: 0 }));
        addNotice('ORDER', 'Order placed', `Your order for ${listing.quantityKg} kg ${listing.crop} was submitted.`);
        return true;
      } catch (error) {
        addNotice('SYSTEM', 'Order not placed', error instanceof Error ? error.message : 'Backend order request failed');
        return false;
      }
    },
    advanceOrder: (id, status) => {
      setOrders((all) => progressOrder(all, id, status));
      void patchApi<{ order: Order }>(`/api/orders/${id}/status`, { status }).catch(() => undefined);
      addNotice(status === 'DELIVERED' ? 'PAYMENT' : 'ORDER', 'Order updated', `Order ${id} is now ${status.replaceAll('_', ' ')}.`);
    },
    notifications,
    markNotificationRead: (id) => setNotifications((all) => all.map((item) => item.id === id ? { ...item, read: true } : item)),
  }), [role, listings, listingsLoading, listingsError, orders, notifications]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const state = useContext(Context);
  if (!state) throw new Error('useApp must be inside AppProvider');
  return state;
}
