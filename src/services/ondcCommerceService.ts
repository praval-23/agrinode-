import { getApi, postApi } from '@/services/apiClient';
import type {
    OndcConfirmResponse,
    OndcInitResponse,
    OndcOrderStatusResponse,
    OndcSearchResponse,
    OndcSelectResponse,
    OndcTrackResponse,
} from '@/types/ondc';

export function searchOndcListings(query: { crop?: string; grade?: string; location?: string; limit?: number } = {}) {
  return postApi<OndcSearchResponse>('/api/ondc/search', query);
}

export function selectOndcListing(input: { listingId: string; quantityKg: number }) {
  return postApi<OndcSelectResponse>('/api/ondc/select', input);
}

export function initializeOndcOrder(input: {
  listingId: string;
  quantityKg: number;
  deliveryLocation: string;
  buyerId: string;
}) {
  return postApi<OndcInitResponse>('/api/ondc/init', input);
}

export function confirmOndcOrder(input: {
  listingId: string;
  quantityKg: number;
  deliveryLocation: string;
  buyerId: string;
  transactionId: string;
}) {
  return postApi<OndcConfirmResponse>('/api/ondc/confirm', input);
}

export function getOndcOrderStatus(orderId: string) {
  return getApi<OndcOrderStatusResponse>(`/api/ondc/orders/${encodeURIComponent(orderId)}/status`);
}

export function getOndcOrderTracking(orderId: string) {
  return getApi<OndcTrackResponse>(`/api/ondc/orders/${encodeURIComponent(orderId)}/track`);
}