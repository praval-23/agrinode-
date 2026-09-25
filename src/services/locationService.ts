import { demoLocation, getMarketLocation } from '@/data/marketLocations';
import * as Location from 'expo-location';

export type LocationSource = 'gps' | 'manual' | 'demo';
export type UserLocation = {
  city: string;
  district: string | null;
  state: string;
  latitude: number | null;
  longitude: number | null;
  source: LocationSource;
};

export class LocationPermissionError extends Error {
  constructor() { super('Location permission was not granted'); this.name = 'LocationPermissionError'; }
}

export const demoUserLocation: UserLocation = { ...demoLocation, source: 'demo' };

function normalizeLabel(value: string | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeLocation(city: string, district: string | null | undefined, state: string, latitude: number | null, longitude: number | null, source: LocationSource): UserLocation {
  const normalizedCity = city.trim() || 'Unknown city';
  const normalizedState = state.trim() || 'Unknown state';
  const known = getMarketLocation(normalizedCity);
  const districtMatchesKnownCity = known && (
    normalizeLabel(known.state) === normalizeLabel(normalizedState)
    && normalizeLabel(district ?? '') === normalizeLabel(known.district)
  );
  const validatedDistrict = source === 'manual'
    ? district?.trim() || null
    : districtMatchesKnownCity
      ? district!.trim()
      : null;
  if (__DEV__) console.info('[location] validated location', { city: normalizedCity, district: validatedDistrict, state: normalizedState, latitude, longitude, source });
  return {
    city: normalizedCity,
    district: validatedDistrict,
    state: normalizedState,
    latitude,
    longitude,
    source,
  };
}

export async function getCurrentUserLocation(): Promise<UserLocation> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new LocationPermissionError();
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const [place] = await Location.reverseGeocodeAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude });
  if (__DEV__) console.info('[location] raw GPS coordinates', position.coords.latitude, position.coords.longitude);
  if (__DEV__) console.info('[location] raw reverse-geocoding result', place);
  const city = place?.city ?? place?.subregion ?? place?.district ?? 'Unknown city';
  return normalizeLocation(
    city,
    place?.district ?? place?.subregion ?? '',
    place?.region ?? 'Unknown state',
    position.coords.latitude,
    position.coords.longitude,
    'gps',
  );
}

export function createManualLocation(city: string, district: string, state: string): UserLocation {
  const normalizedCity = city.trim() || demoLocation.city;
  const known = getMarketLocation(normalizedCity);
  return normalizeLocation(
    normalizedCity,
    district.trim() || known?.district || null,
    state.trim() || known?.state || demoLocation.state,
    known?.latitude ?? null,
    known?.longitude ?? null,
    'manual',
  );
}