import type { MarketPrice } from '@/types/market';
import type { UserLocation } from './locationService';

const NEARBY_KM = 250;

function normalizeDistrict(value: string) {
  return value.toLowerCase().replace(/\s+urban$/, '').trim();
}

function distanceKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = Math.PI / 180;
  const latitudeDelta = (latitudeB - latitudeA) * radians;
  const longitudeDelta = (longitudeB - longitudeA) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA * radians) * Math.cos(latitudeB * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rankMarkets(prices: MarketPrice[], userLocation: UserLocation): MarketPrice[] {
  const hasTrustedDistrict = Boolean(userLocation.district?.trim());
  const ranked = prices.map((price) => {
    const distance = userLocation.latitude !== null && userLocation.longitude !== null && price.latitude !== null && price.longitude !== null
      ? distanceKm(userLocation.latitude, userLocation.longitude, price.latitude, price.longitude)
      : undefined;
    return { ...price, distanceKm: distance === undefined ? undefined : Math.round(distance) };
  }).sort((left, right) => {
    const leftDistance = left.distanceKm ?? Number.POSITIVE_INFINITY;
    const rightDistance = right.distanceKm ?? Number.POSITIVE_INFINITY;
    const leftSameDistrict = hasTrustedDistrict && normalizeDistrict(left.district) === normalizeDistrict(userLocation.district!);
    const rightSameDistrict = hasTrustedDistrict && normalizeDistrict(right.district) === normalizeDistrict(userLocation.district!);
    const leftSameState = left.state.toLowerCase() === userLocation.state.toLowerCase();
    const rightSameState = right.state.toLowerCase() === userLocation.state.toLowerCase();
    const leftGroup = leftSameDistrict ? 0 : leftSameState ? 1 : leftDistance <= NEARBY_KM ? 2 : 3;
    const rightGroup = rightSameDistrict ? 0 : rightSameState ? 1 : rightDistance <= NEARBY_KM ? 2 : 3;
    return leftGroup - rightGroup || leftDistance - rightDistance || left.name.localeCompare(right.name);
  });
  // Location-aware relevance: same-state records always qualify; cross-state records only
  // qualify with verified coordinates within NEARBY_KM. Never let far cross-state markets
  // ride along just because the backend response contained them.
  const relevant = ranked.filter((market) => market.state.toLowerCase() === userLocation.state.toLowerCase()
    || (market.distanceKm !== undefined && market.distanceKm <= NEARBY_KM));
  // One card per commodity: the backend already picked the best district record before any
  // state-scope record, so keeping the first occurrence per commodity in ranked order
  // preserves the district-first priority.
  const seenCommodities = new Set<string>();
  const uniqueCommodities = relevant.filter((market) => {
    const key = market.commodity.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seenCommodities.has(key)) return false;
    seenCommodities.add(key);
    return true;
  });
  if (__DEV__) console.info('[market] calculated distances, deduped to unique commodities', uniqueCommodities.length, 'of', relevant.length, 'records', uniqueCommodities.slice(0, 10).map((market) => ({ market: market.market, district: market.district, state: market.state, scope: market.locationScope, distanceKm: market.distanceKm })));
  return uniqueCommodities;
}