import { useLocationSelection } from '@/context/LocationContext';
import { rankMarkets } from '@/services/marketRanking';
import { getMarketPricesWithStatus, type MarketDataSource } from '@/services/pricingService';
import type { MarketPrice } from '@/types/market';
import { useEffect, useRef, useState } from 'react';

const requests = new Map<string, Promise<Awaited<ReturnType<typeof getMarketPricesWithStatus>>>>();

function locationKey(location: ReturnType<typeof useLocationSelection>['location']) {
  return [location.latitude, location.longitude, location.city, location.district, location.state].join('|');
}

function getSharedMarketPrices(location: ReturnType<typeof useLocationSelection>['location'], force = false) {
  const key = locationKey(location);
  const existing = force ? undefined : requests.get(key);
  if (existing) return existing;
  const request = getMarketPricesWithStatus(location);
  requests.set(key, request);
  return request;
}

export function useMarketPrices() {
  const { location } = useLocationSelection();
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [source, setSource] = useState<MarketDataSource>('mock');
  const [locationScope, setLocationScope] = useState<'district' | 'state' | 'none' | undefined>(undefined);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const refreshInFlight = useRef(false);
  const key = locationKey(location);

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (__DEV__) console.info('[market] fetch triggered', location);
    void getSharedMarketPrices(location, retryCount > 0)
      .then((result) => {
        if (!active) return;
        setPrices(result.prices);
        setSource(result.source);
        setLocationScope(result.locationScope);
        setError(result.error);
        if (__DEV__) console.info('[market] state update', 'source', result.source, 'location scope', result.locationScope ?? 'unknown', 'record count', result.prices.length);
      })
      .catch((reason) => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : 'Backend request failed';
        setError(message);
        if (__DEV__) console.warn('[market] state update error', message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [key, retryCount]);

  const refresh = async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      const result = await getSharedMarketPrices(location, true);
      setPrices(result.prices);
      setSource(result.source);
      setLocationScope(result.locationScope);
      setError(result.error);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Backend request failed');
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  };

  const rankedPrices = rankMarkets(prices, location);
  if (__DEV__) console.info('[market] final sorted markets for display', rankedPrices.slice(0, 10).map((market) => ({ market: market.market, location: `${market.district}, ${market.state}`, distanceKm: market.distanceKm })));
  return { prices: rankedPrices, source, locationScope, error, loading, refreshing, refresh, isFallback: source === 'mock' || source === 'mock-fallback', retry: () => setRetryCount((count) => count + 1) };
}
