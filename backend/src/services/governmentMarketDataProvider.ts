import { env } from '../config/env';
import type { MarketDataProvider, MarketPrice, MarketQuery, PriceUnit } from '../types/market';

type GovernmentRecord = Record<string, unknown>;
type GovernmentResponse = { records?: unknown };

export class GovernmentMarketDataError extends Error {
  constructor(public readonly kind: 'configuration' | 'timeout' | 'authentication' | 'rate_limit' | 'invalid_response' | 'empty_response' | 'missing_field' | 'request', message: string) {
    super(message);
    this.name = 'GovernmentMarketDataError';
  }
}

function requestUrlWithoutApiKey(requestUrl: string): string {
  const url = new URL(requestUrl);
  url.searchParams.delete('api-key');
  return url.toString();
}

export function buildGovernmentRequestUrl(query: MarketQuery | undefined, scope: 'district' | 'state', page = 0): string {
  const params = new URLSearchParams({
    'api-key': env.government.apiKey!,
    format: 'json',
    limit: String(env.government.limit),
    offset: String(page * env.government.limit),
  });
  if (query?.state) params.set('filters[state]', query.state);
  if (scope === 'district' && query?.district) params.set('filters[district]', query.district);
  if (query?.market) params.set('filters[market]', query.market);
  return `${env.government.apiBaseUrl}/${env.government.resourceId}?${params.toString()}`;
}

function readText(record: GovernmentRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const value = Object.entries(record).find(([recordKey]) => recordKey.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey)?.[1];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function readRequiredText(record: GovernmentRecord, field: string, ...keys: string[]): string {
  const value = readText(record, ...keys);
  if (!value) throw new GovernmentMarketDataError('missing_field', `Government record is missing ${field}`);
  return value;
}

function readPrice(record: GovernmentRecord, field: string, ...keys: string[]): number {
  const value = keys.map((key) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return Object.entries(record).find(([recordKey]) => recordKey.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey)?.[1];
  }).find((candidate) => candidate !== undefined);
  const price = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(price) || price < 0) {
    throw new GovernmentMarketDataError('missing_field', `Government record has an invalid ${field}`);
  }
  return price;
}

function readOptionalCoordinate(record: GovernmentRecord, field: string, ...keys: string[]): number | null {
  const value = keys.map((key) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return Object.entries(record).find(([recordKey]) => recordKey.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey)?.[1];
  }).find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
  const coordinate = typeof value === 'number' ? value : Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(coordinate)) return null;
  if (field === 'latitude' && (coordinate < -90 || coordinate > 90)) return null;
  if (field === 'longitude' && (coordinate < -180 || coordinate > 180)) return null;
  return coordinate;
}

function resolveSourceUnit(record: GovernmentRecord): PriceUnit {
  const rawUnit = readText(record, 'unit', 'price_unit', 'unit_of_measurement');
  if (!rawUnit) return 'quintal';
  const unit = rawUnit.toLowerCase().replace(/\s+/g, '');
  if (unit === 'kg' || unit === 'rs/kg' || unit === '₹/kg') return 'kg';
  if (unit === 'quintal' || unit === 'qtl' || unit === 'rs/quintal' || unit === '₹/quintal') return 'quintal';
  if (unit === 'tonne' || unit === 'ton' || unit === 'rs/tonne' || unit === '₹/tonne') return 'tonne';
  if (unit === '100kg' || unit === 'rs/100kg' || unit === '₹/100kg') return '100kg';
  throw new GovernmentMarketDataError('invalid_response', `Unsupported government price unit: ${rawUnit}`);
}

export function normalizeGovernmentPriceToKg(price: number, unit: PriceUnit): number {
  if (unit === 'kg') return price;
  if (unit === 'quintal' || unit === '100kg') return price / 100;
  if (unit === 'tonne') return price / 1000;
  throw new GovernmentMarketDataError('invalid_response', `Cannot normalize unsupported price unit: ${unit}`);
}

function toMarketPrice(record: GovernmentRecord, index: number): MarketPrice {
  const sourcePrice = readPrice(record, 'modal price', 'modal_price', 'modal price');
  const sourceUnit = resolveSourceUnit(record);
  const normalizedPricePerKg = normalizeGovernmentPriceToKg(sourcePrice, sourceUnit);
  const date = readRequiredText(record, 'date', 'arrival_date', 'date', 'reported_date');
  const commodity = readRequiredText(record, 'commodity', 'commodity', 'commodity_name');
  const market = readRequiredText(record, 'market', 'market', 'market_name');
  const district = readRequiredText(record, 'district', 'district', 'district_name');
  const state = readRequiredText(record, 'state', 'state', 'state_name');
  const latitude = readOptionalCoordinate(record, 'latitude', 'latitude', 'lat');
  const longitude = readOptionalCoordinate(record, 'longitude', 'longitude', 'lon', 'lng');

  return {
    id: `${commodity.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${market.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
    name: commodity,
    category: 'Government market data',
    commodity,
    variety: readText(record, 'variety') ?? 'Unknown',
    market,
    district,
    state,
    date,
    sourcePrice,
    sourceUnit,
    minPrice: readPrice(record, 'minimum price', 'min_price', 'min price', 'minimum'),
    maxPrice: readPrice(record, 'maximum price', 'max_price', 'max price', 'maximum'),
    modalPrice: sourcePrice,
    normalizedPricePerKg,
    previousPricePerKg: null,
    changePercent: null,
    trend: [],
    demand: null,
    source: 'Agmarknet',
    lastUpdated: new Date().toISOString(),
    icon: commodity.slice(0, 2).toUpperCase(),
    latitude,
    longitude,
  };
}

export class GovernmentMarketDataProvider implements MarketDataProvider {
  async getHistoryRecords(query: MarketQuery, scope: 'district' | 'state'): Promise<MarketPrice[]> {
    if (!env.government.apiKey) throw new GovernmentMarketDataError('configuration', 'GOVERNMENT_API_KEY is required for the official OGD Data API');
    const records = await this.fetchRecords(query, { scope });
    const prices: MarketPrice[] = [];
    for (const [index, record] of records.entries()) {
      try { prices.push(toMarketPrice(record, index)); } catch { /* malformed history rows are ignored */ }
    }
    return prices;
  }

  async getPrices(query?: MarketQuery, options?: { scope: 'district' | 'state' }): Promise<MarketPrice[]> {
    if (!env.government.apiKey) {
      throw new GovernmentMarketDataError('configuration', 'GOVERNMENT_API_KEY is required for the official OGD Data API');
    }

    try {
      const records = await this.fetchRecords(query, options);
      // Skip malformed rows instead of failing the whole pool: one bad record must not
      // zero out the watchlist or trigger the mock fallback.
      const prices: MarketPrice[] = [];
      let skipped = 0;
      for (const [index, record] of records.entries()) {
        try {
          prices.push(toMarketPrice(record, index));
        } catch {
          skipped += 1;
        }
      }
      if (records.length > 0 && prices.length === 0) throw new GovernmentMarketDataError('invalid_response', 'Government API returned no valid market records');
      if (process.env.NODE_ENV !== 'production') console.info('[market] government provider result', { source: 'government', fallback: false, recordCount: prices.length, locationScope: options?.scope ?? 'state', skippedMalformed: skipped });
      return prices;
    } catch (error) {
      if (error instanceof GovernmentMarketDataError) throw error;
      if ((error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')) {
        throw new GovernmentMarketDataError('timeout', `Government API timed out after ${env.government.timeoutMs}ms`);
      }
      throw new GovernmentMarketDataError('request', error instanceof Error ? error.message : 'Government API request failed');
    }
  }

  private async fetchRecords(query?: MarketQuery, options?: { scope: 'district' | 'state' }): Promise<GovernmentRecord[]> {
    const scope = options?.scope ?? 'state';
    const fetchPage = async (): Promise<GovernmentRecord[]> => {
      const records: GovernmentRecord[] = [];
      for (let page = 0; page < env.government.maxPages; page += 1) {
        const requestUrl = buildGovernmentRequestUrl(query, scope, page);
        const startedAt = Date.now();
        if (process.env.NODE_ENV !== 'production') console.info('[market] government API request', {
          urlWithoutApiKey: requestUrlWithoutApiKey(requestUrl), filters: { state: query?.state ?? null, district: scope === 'district' ? query?.district ?? null : null, market: query?.market ?? null }, scope,
          limit: env.government.limit,
          offset: page * env.government.limit,
        });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), env.government.timeoutMs);
        try {
          const response = await fetch(requestUrl, { signal: controller.signal });
          if (process.env.NODE_ENV !== 'production') console.info('[market] government API response', {
            urlWithoutApiKey: requestUrlWithoutApiKey(requestUrl), status: response.status, responseTimeMs: Date.now() - startedAt,
          });
          if (response.status === 401 || response.status === 403) throw new GovernmentMarketDataError('authentication', `Government API authentication failed (${response.status})`);
          if (response.status === 429) throw new GovernmentMarketDataError('rate_limit', 'Government API rate limit exceeded');
          if (!response.ok) throw new GovernmentMarketDataError('request', `Government API request failed (${response.status})`);
          let payload: GovernmentResponse;
          try {
            payload = await response.json() as GovernmentResponse;
          } catch {
            throw new GovernmentMarketDataError('invalid_response', 'Government API returned invalid JSON');
          }
          if (!Array.isArray(payload.records)) throw new GovernmentMarketDataError('invalid_response', 'Government API response did not contain a records array');
          const pageRecords = payload.records.filter((record): record is GovernmentRecord => Boolean(record) && typeof record === 'object');
          if (pageRecords.length === 0 && page === 0) throw new GovernmentMarketDataError('empty_response', 'Government API returned no records');
          records.push(...pageRecords);
          if (pageRecords.length < env.government.limit) break;
        } catch (error) {
          if (process.env.NODE_ENV !== 'production') console.info('[market] government API failure', {
            urlWithoutApiKey: requestUrlWithoutApiKey(requestUrl), status: null, responseTimeMs: Date.now() - startedAt,
            errorClass: (error instanceof Error && error.name === 'AbortError') ? 'timeout' : error instanceof GovernmentMarketDataError ? error.kind : 'request',
          });
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      }
      return records;
    };

    // Explicit scope only: a district-scoped fetch must never silently widen to a
    // state or unfiltered fetch — the route orchestrates scope widening itself.
    return fetchPage();
  }

  async getPrice(id: string): Promise<MarketPrice | undefined> {
    return (await this.getPrices()).find((price) => price.id === id);
  }
}