import type { FarmerListing } from '@/types/listing';

type BackendListing = Omit<FarmerListing, 'distanceKm' | 'dataSource'> & { availableQuantityKg: number };

export function mapBackendListing(listing: BackendListing): FarmerListing {
  return {
    ...listing,
    distanceKm: 0,
    dataSource: 'backend',
  };
}