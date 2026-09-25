import { Router } from 'express';
import { env } from '../config/env';
import { getMarketLocation } from '../data/marketLocations';
import { GovernmentMarketDataError, GovernmentMarketDataProvider } from '../services/governmentMarketDataProvider';
import { MockMarketDataProvider } from '../services/marketDataProvider';
import { diversifyByCommodity } from '../services/marketDiversification';
import { buildMarketHistory } from '../services/marketHistory';
import type { MarketPrice } from '../types/market';

const marketRouter = Router();
const mockProvider = new MockMarketDataProvider();
const governmentProvider = new GovernmentMarketDataProvider();

marketRouter.get('/history', async (request, response, next) => {
  try {
    const commodity = typeof request.query.commodity === 'string' ? request.query.commodity.trim() : '';
    const market = typeof request.query.market === 'string' ? request.query.market.trim() : undefined;
    const district = typeof request.query.district === 'string' ? request.query.district.trim() : undefined;
    const state = typeof request.query.state === 'string' ? request.query.state.trim() : undefined;
    const daysValue = typeof request.query.days === 'string' ? Number(request.query.days) : 7;
    if (!commodity || commodity.length > 100) { response.status(400).json({ error: 'commodity is required and must be at most 100 characters' }); return; }
    if (!state) { response.status(400).json({ error: 'state is required for location-safe history' }); return; }
    if (!Number.isInteger(daysValue) || daysValue < 1 || daysValue > 90) { response.status(400).json({ error: 'days must be an integer between 1 and 90' }); return; }

    if (env.marketDataProvider !== 'government') {
      response.json({ ...buildMarketHistory([], { commodity, market, days: daysValue, locationScope: 'none', source: 'mock' }), demand: null });
      return;
    }

    const normalizedState = state.toLowerCase();
    const normalizedDistrict = district?.toLowerCase().replace(/\s+urban$/, '');
    const normalizedMarket = market?.toLowerCase();
    const scopeMatches = (record: MarketPrice, scope: 'district' | 'state') => record.state.trim().toLowerCase() === normalizedState
      && (scope === 'state' || !normalizedDistrict || record.district.trim().toLowerCase().replace(/\s+urban$/, '') === normalizedDistrict)
      && (!normalizedMarket || record.market.trim().toLowerCase() === normalizedMarket);

    let records: MarketPrice[] = [];
    let locationScope: 'district' | 'state' = district ? 'district' : 'state';
    if (district) {
      records = (await governmentProvider.getHistoryRecords({ state, district, market }, 'district')).filter((record) => scopeMatches(record, 'district'));
      if (records.length === 0) {
        records = (await governmentProvider.getHistoryRecords({ state, market }, 'state')).filter((record) => scopeMatches(record, 'state'));
        locationScope = 'state';
      }
    } else {
      records = (await governmentProvider.getHistoryRecords({ state, market }, 'state')).filter((record) => scopeMatches(record, 'state'));
    }
    const history = buildMarketHistory(records, { commodity, market, days: daysValue, locationScope, source: 'government' });
    response.setHeader('X-Market-Data-Source', 'government');
    response.setHeader('X-Market-Data-Fallback', 'false');
    response.setHeader('X-Market-Data-Location-Scope', locationScope);
    response.json(history);
  } catch (error) {
    next(error);
  }
});

function locationSummary(location: { latitude?: number; longitude?: number; city?: string; district?: string; state?: string }) {
  return { latitude: location.latitude ?? null, longitude: location.longitude ?? null, city: location.city ?? null, district: location.district ?? null, state: location.state ?? null };
}

/** Records whose state must match before they may be shown for a state-scoped request. */
function stateScopeMatches(record: { state: string }, state?: string) {
  return !state || record.state.trim().toLowerCase() === state.trim().toLowerCase();
}

/** Records whose district must match (ignoring an "Urban" suffix) before they may be shown for a district-scoped request. */
function districtScopeMatches(record: { district: string }, district?: string) {
  if (!district) return true;
  return record.district.trim().toLowerCase().replace(/\s+urban$/, '') === district.trim().toLowerCase().replace(/\s+urban$/, '');
}

marketRouter.get('/prices', async (request, response, next) => {
  try {
    const provider = env.marketDataProvider === 'government' ? governmentProvider : mockProvider;
    const locationQuery = {
      latitude: typeof request.query.latitude === 'string' ? Number(request.query.latitude) : undefined,
      longitude: typeof request.query.longitude === 'string' ? Number(request.query.longitude) : undefined,
      city: typeof request.query.city === 'string' ? request.query.city.trim() : undefined,
      district: typeof request.query.district === 'string' ? request.query.district.trim() : undefined,
      state: typeof request.query.state === 'string' ? request.query.state.trim() : undefined,
      market: typeof request.query.market === 'string' ? request.query.market.trim() : undefined,
    };
    const state = typeof request.query.state === 'string' ? request.query.state.trim().toLowerCase() : undefined;
    const requestedDistrict = typeof request.query.district === 'string' ? request.query.district.trim() : undefined;
    const city = typeof request.query.city === 'string' ? request.query.city.trim() : undefined;
    if (requestedDistrict && !state) {
      response.status(400).json({ error: 'state is required when district is provided for location-safe market data' });
      return;
    }
    const knownCity = city ? getMarketLocation(city) : undefined;
    const districtIsConsistent = !requestedDistrict || !knownCity || (
      knownCity.state.toLowerCase() === (locationQuery.state ?? '').toLowerCase()
      && knownCity.district.toLowerCase().replace(/\s+urban$/, '') === requestedDistrict.toLowerCase().replace(/\s+urban$/, '')
    );
    const district = districtIsConsistent ? requestedDistrict?.toLowerCase() : undefined;
    const market = typeof request.query.market === 'string' ? request.query.market.trim().toLowerCase() : undefined;
    const validatedLocationQuery = { ...locationQuery, district: districtIsConsistent ? locationQuery.district : undefined };
    const matchesFilters = (price: { state: string; district: string; market: string }) => (!state || price.state.toLowerCase() === state) && (!district || price.district.toLowerCase() === district) && (!market || price.market.toLowerCase() === market);
    const developmentLogging = process.env.NODE_ENV !== 'production';
    if (developmentLogging) console.info('[market] requested location', locationSummary(validatedLocationQuery));
    try {
      if (env.marketDataProvider !== 'government') {
        const prices = (await provider.getPrices(validatedLocationQuery)).filter(matchesFilters);
        response.setHeader('X-Market-Data-Source', 'mock-fallback');
        response.setHeader('X-Market-Data-Fallback', 'true');
        response.setHeader('X-Market-Data-Location-Scope', 'none');
        response.json({ records: prices, source: 'mock-fallback', fallback: true, locationScope: 'none', location: locationSummary(validatedLocationQuery) });
        return;
      }

      // Government provider: always fetch with explicit location filters, then safety-filter
      // by the scope that produced the result. Never widen to an unfiltered fetch: showing
      // records from other states for a state-scoped request is the bug this route exists
      // to prevent.
      const requestedScope = validatedLocationQuery.district ? 'district' : validatedLocationQuery.state ? 'state' : 'none';
      const stateArg = validatedLocationQuery.state;
      const districtArg = validatedLocationQuery.district;
      let districtRecords: MarketPrice[] = [];
      let stateRecords: MarketPrice[] = [];
      if (requestedScope === 'district') {
        const rawDistrict = await governmentProvider.getPrices({ state: stateArg, district: districtArg, market: validatedLocationQuery.market }, { scope: 'district' });
        districtRecords = rawDistrict.filter((record) => districtScopeMatches(record, district) && stateScopeMatches(record, state));
      } else if (requestedScope === 'state') {
        const rawState = await governmentProvider.getPrices({ state: stateArg, market: validatedLocationQuery.market }, { scope: 'state' });
        stateRecords = rawState.filter((record) => stateScopeMatches(record, state));
      } else {
        stateRecords = await governmentProvider.getPrices();
      }
      const selection = diversifyByCommodity({
        districtRecords,
        stateRecords,
        city: validatedLocationQuery.city,
        district: districtArg,
      });
      const prices = selection.selected.map((record) => {
        const pool = record.locationScope === 'district' ? districtRecords : stateRecords;
        const history = buildMarketHistory(pool, { commodity: record.commodity, market: record.market, days: 7, locationScope: record.locationScope ?? 'none', source: 'government' });
        return {
          ...record,
          normalizedPricePerKg: history.currentPrice ?? record.normalizedPricePerKg,
          previousPricePerKg: history.previousPrice,
          changePercent: history.changePercent,
          trend: history.history.map((point) => point.price),
        };
      });
      const locationScope = districtRecords.length > 0 ? 'district' : stateRecords.length > 0 ? 'state' : 'none';
      if (developmentLogging) {
        console.info('[market] government location-filtered records', 'strategy', requestedScope);
        console.info('[market] diversification diagnostics', {
          totalDistrictRecords: selection.districtRecordCount,
          uniqueDistrictCommodities: selection.districtUniqueCommodities,
          totalStateRecords: selection.stateRecordCount,
          uniqueStateCommodities: selection.stateUniqueCommodities,
          finalUniqueCommodities: selection.selected.length,
          districtRecordCountSelected: selection.selected.filter((record) => record.locationScope === 'district').length,
          stateRecordCountSelected: selection.selected.filter((record) => record.locationScope === 'state').length,
          displayedCrops: selection.selected.map((record) => record.commodity),
        });
      }
      if (prices.length > 0) {
        response.setHeader('X-Market-Data-Source', 'government');
        response.setHeader('X-Market-Data-Fallback', 'false');
        response.setHeader('X-Market-Data-Location-Scope', locationScope);
        if (developmentLogging) console.info('[market] final source', 'government', 'final record count', prices.length, 'location scope', locationScope);
        response.json({ records: prices, source: 'government', fallback: false, locationScope, location: locationSummary(validatedLocationQuery) });
        return;
      }
      if (!env.marketDataFallbackEnabled) {
        response.setHeader('X-Market-Data-Source', 'government');
        response.setHeader('X-Market-Data-Fallback', 'false');
        response.setHeader('X-Market-Data-Location-Scope', 'none');
        if (developmentLogging) console.info('[market] final source', 'government', 'final record count', 0, 'location scope', 'none');
        response.json({ records: [], source: 'government', fallback: false, locationScope: 'none', location: locationSummary(validatedLocationQuery) });
        return;
      }
      const fallback = (await mockProvider.getPrices()).filter(matchesFilters);
      response.setHeader('X-Market-Data-Source', 'mock-fallback');
      response.setHeader('X-Market-Data-Fallback', 'true');
      response.setHeader('X-Market-Data-Location-Scope', 'none');
      response.setHeader('X-Market-Data-Error-Class', 'no_location_records');
      if (developmentLogging) console.info('[market] final source', 'mock-fallback', 'final record count', fallback.length, 'location scope', 'none');
      response.json({ records: fallback, source: 'mock-fallback', fallback: true, locationScope: 'none', location: locationSummary(validatedLocationQuery) });
    } catch (error) {
      if (env.marketDataProvider !== 'government' || !env.marketDataFallbackEnabled) throw error;
      const fallback = await mockProvider.getPrices();
      response.setHeader('X-Market-Data-Source', 'mock-fallback');
      response.setHeader('X-Market-Data-Fallback', 'true');
      response.setHeader('X-Market-Data-Location-Scope', 'none');
      response.setHeader('X-Market-Data-Error-Class', error instanceof GovernmentMarketDataError ? error.kind : 'request');
      response.setHeader('X-Market-Data-Error', error instanceof Error ? error.message : 'Government provider failed');
      const records = fallback.filter(matchesFilters);
      if (developmentLogging) console.info('[market] final source', 'mock-fallback', 'final record count', records.length, 'location scope', 'none');
      response.json({ records, source: 'mock-fallback', fallback: true, locationScope: 'none', location: locationSummary(validatedLocationQuery) });
    }
  } catch (error) {
    next(error);
  }
});

export default marketRouter;