import { env } from '../config/env';
import type { MarketDataProvider, MarketPrice, MarketQuery, PriceUnit } from '../types/market';
import { parseArrivalDate } from './marketDiversification';

type GovernmentRecord = Record<string, unknown>;
type GovernmentResponse = { total?: unknown; records?: unknown };
type GovernmentPage = { total: number; records: GovernmentRecord[] };

const cache = new Map<string, { expiresAt: number; promise: Promise<MarketPrice[]> }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

export class GovernmentMarketDataError extends Error {
  constructor(
    public readonly kind: 'configuration' | 'timeout' | 'authentication' | 'rate_limit' | 'invalid_response' | 'request',
    message: string,
  ) {
    super(message);
    this.name = 'GovernmentMarketDataError';
  }
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizedDistrict(value: string): string {
  const district = value.trim().toLowerCase().replace(/\s+urban$/, '');
  if (district === 'bangalore' || district === 'bengaluru') return 'bengaluru';
  return district;
}

export function governmentDistrictName(value: string): string {
  return normalizedDistrict(value) === 'bengaluru' ? 'Bangalore' : value.trim();
}

export function governmentDistrictMatches(left: string, right: string): boolean {
  return normalizedDistrict(left) === normalizedDistrict(right);
}

export function calculateTailOffset(total: number, limit: number): number {
  return Math.max(0, total - limit);
}

function requiredApiKey(): string {
  if (!env.government.apiKey) {
    throw new GovernmentMarketDataError('configuration', 'GOVERNMENT_API_KEY is required for the official OGD Data API');
  }
  return env.government.apiKey;
}

export function buildGovernmentRequestUrl(
  query: MarketQuery | undefined,
  scope: 'district' | 'state',
  limit = env.government.limit,
  offset = 0,
): string {
  const url = new URL(`${env.government.apiBaseUrl}/${encodeURIComponent(env.government.resourceId)}`);
  const params = new URLSearchParams();
  params.set('api-key', requiredApiKey());
  params.set('format', 'json');
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (query?.state) params.set('filters[State]', query.state);
  if (scope === 'district' && query?.district) {
    params.set('filters[District]', governmentDistrictName(query.district));
  }
  if (query?.commodity) params.set('filters[Commodity]', query.commodity);
  if (query?.market) params.set('filters[Market]', query.market);
  url.search = params.toString();
  return url.toString();
}

function urlForDiagnostics(requestUrl: string): string {
  const url = new URL(requestUrl);
  url.searchParams.delete('api-key');
  return url.toString();
}

function valueFor(record: GovernmentRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    const wanted = normalizedKey(key);
    const found = Object.entries(record).find(([recordKey]) => normalizedKey(recordKey) === wanted)?.[1];
    if (found !== undefined) return found;
  }
  return undefined;
}

function readText(record: GovernmentRecord, ...keys: string[]): string | undefined {
  const value = valueFor(record, ...keys);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readRequiredText(record: GovernmentRecord, field: string, ...keys: string[]): string {
  const value = readText(record, ...keys);
  if (!value) throw new GovernmentMarketDataError('invalid_response', `Government record is missing ${field}`);
  return value;
}

function readPrice(record: GovernmentRecord, field: string, ...keys: string[]): number {
  const value = valueFor(record, ...keys);
  const price = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.replace(/,/g, '').trim())
      : Number.NaN;
  if (!Number.isFinite(price) || price < 0) {
    throw new GovernmentMarketDataError('invalid_response', `Government record has an invalid ${field}`);
  }
  return price;
}

function readOptionalCoordinate(record: GovernmentRecord, field: string, ...keys: string[]): number | null {
  const value = valueFor(record, ...keys);
  if (value === undefined || value === null || value === '') return null;
  const coordinate = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(coordinate)) return null;
  if (field === 'latitude' && (coordinate < -90 || coordinate > 90)) return null;
  if (field === 'longitude' && (coordinate < -180 || coordinate > 180)) return null;
  return coordinate;
}

function resolveSourceUnit(record: GovernmentRecord): PriceUnit | null {
  const rawUnit = readText(record, 'Unit', 'Price_Unit', 'Unit_of_Measurement') ?? env.government.priceUnit;
  if (!rawUnit) return null;
  const unit = rawUnit.toLowerCase().replace(/\s+/g, '');
  if (unit === 'kg' || unit === 'rs/kg' || unit === '₹/kg') return 'kg';
  if (unit === 'quintal' || unit === 'qtl' || unit === 'rs/quintal' || unit === '₹/quintal') return 'quintal';
  if (unit === 'tonne' || unit === 'ton' || unit === 'rs/tonne' || unit === '₹/tonne') return 'tonne';
  if (unit === '100kg' || unit === 'rs/100kg' || unit === '₹/100kg') return '100kg';
  throw new GovernmentMarketDataError('invalid_response', 'Government feed reported an unsupported price unit');
}

export function normalizeGovernmentPriceToKg(price: number, unit: PriceUnit): number {
  if (unit === 'kg') return price;
  if (unit === 'quintal' || unit === '100kg') return price / 100;
  if (unit === 'tonne') return price / 1000;
  throw new GovernmentMarketDataError('invalid_response', 'Cannot normalize unsupported price unit');
}

function isFreshDate(date: string): boolean {
  const arrival = parseArrivalDate(date);
  if (arrival === null) return false;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ageDays = Math.floor((today - arrival) / 86_400_000);
  return ageDays >= 0 && ageDays <= env.government.freshnessDays;
}

function toMarketPrice(record: GovernmentRecord): MarketPrice {
  const date = readRequiredText(record, 'arrival date', 'Arrival_Date', 'Date');
  const arrivalDate = parseArrivalDate(date);
  if (arrivalDate === null) throw new GovernmentMarketDataError('invalid_response', 'Government record has an invalid arrival date');
  const today = new Date();
  if (arrivalDate > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) {
    throw new GovernmentMarketDataError('invalid_response', 'Government record has a future arrival date');
  }

  const sourcePrice = readPrice(record, 'modal price', 'Modal_Price');
  const minPrice = readPrice(record, 'minimum price', 'Min_Price');
  const maxPrice = readPrice(record, 'maximum price', 'Max_Price');
  if (minPrice > maxPrice) throw new GovernmentMarketDataError('invalid_response', 'Government record has an inverted price range');
  const sourceUnit = resolveSourceUnit(record);
  const normalizedPricePerKg = sourceUnit ? normalizeGovernmentPriceToKg(sourcePrice, sourceUnit) : null;
  const commodity = readRequiredText(record, 'commodity', 'Commodity');
  const market = readRequiredText(record, 'market', 'Market');
  const district = readRequiredText(record, 'district', 'District');
  const state = readRequiredText(record, 'state', 'State');
  const variety = readText(record, 'Variety') ?? 'Unknown';
  const grade = readText(record, 'Grade');
  const id = [commodity, market, variety, grade ?? '', date].map((part) => part.trim().toLowerCase()).join('|');

  return {
    id,
    name: commodity,
    category: 'Government market data',
    commodity,
    variety,
    grade,
    market,
    district,
    state,
    date,
    sourcePrice,
    sourceUnit,
    minPrice,
    maxPrice,
    minPricePerKg: sourceUnit ? normalizeGovernmentPriceToKg(minPrice, sourceUnit) : null,
    maxPricePerKg: sourceUnit ? normalizeGovernmentPriceToKg(maxPrice, sourceUnit) : null,
    modalPrice: sourcePrice,
    normalizedPricePerKg,
    previousPricePerKg: null,
    changePercent: null,
    trend: [],
    demand: null,
    source: 'Agmarknet',
    lastUpdated: new Date().toISOString(),
    freshness: isFreshDate(date) ? 'fresh' : 'historical',
    icon: commodity.slice(0, 2).toUpperCase(),
    latitude: readOptionalCoordinate(record, 'latitude', 'Latitude', 'Lat'),
    longitude: readOptionalCoordinate(record, 'longitude', 'Longitude', 'Lon', 'Lng'),
  };
}

function parseTotal(value: unknown): number {
  const total = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new GovernmentMarketDataError('invalid_response', 'Government API response contained an invalid total');
  }
  return total;
}

export function clearGovernmentMarketCache(): void {
  cache.clear();
}

export class GovernmentMarketDataProvider implements MarketDataProvider {
  async getHistoryRecords(query: MarketQuery, scope: 'district' | 'state'): Promise<MarketPrice[]> {
    return this.getPrices(query, { scope });
  }

  async getPrices(query?: MarketQuery, options?: { scope: 'district' | 'state' }): Promise<MarketPrice[]> {
    requiredApiKey();
    const scope = options?.scope ?? 'state';
    const cacheKey = JSON.stringify({
      resource: env.government.resourceId,
      scope,
      state: query?.state ?? '',
      district: query?.district ?? '',
      commodity: query?.commodity ?? '',
      market: query?.market ?? '',
      limit: env.government.limit,
      priceUnit: env.government.priceUnit ?? '',
    });
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = this.fetchRecentRecords(query, scope);
    cache.delete(cacheKey);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, promise });
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    try {
      return await promise;
    } catch (error) {
      if (cache.get(cacheKey)?.promise === promise) cache.delete(cacheKey);
      throw error;
    }
  }

  private async requestPage(query: MarketQuery | undefined, scope: 'district' | 'state', limit: number, offset: number): Promise<GovernmentPage> {
    const requestUrl = buildGovernmentRequestUrl(query, scope, limit, offset);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.government.timeoutMs);
    try {
      const response = await fetch(requestUrl, { signal: controller.signal });
      if (process.env.NODE_ENV !== 'production') {
        console.info('[market] government API response', {
          url: urlForDiagnostics(requestUrl),
          status: response.status,
          responseTimeMs: Date.now() - startedAt,
        });
      }
      if (response.status === 401 || response.status === 403) {
        throw new GovernmentMarketDataError('authentication', `Government API authentication failed (${response.status})`);
      }
      if (response.status === 429) throw new GovernmentMarketDataError('rate_limit', 'Government API rate limit exceeded');
      if (!response.ok) throw new GovernmentMarketDataError('request', `Government API request failed (${response.status})`);

      let payload: GovernmentResponse;
      try {
        const parsed: unknown = await response.json();
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        payload = parsed as GovernmentResponse;
      } catch {
        throw new GovernmentMarketDataError('invalid_response', 'Government API returned invalid JSON');
      }
      if (!Array.isArray(payload.records)) {
        throw new GovernmentMarketDataError('invalid_response', 'Government API response did not contain a records array');
      }
      const total = parseTotal(payload.total);
      const records = payload.records.filter((record): record is GovernmentRecord =>
        Boolean(record) && typeof record === 'object' && !Array.isArray(record));
      return { total, records };
    } catch (error) {
      if (error instanceof GovernmentMarketDataError) throw error;
      if ((error instanceof Error && error.name === 'AbortError') || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new GovernmentMarketDataError('timeout', `Government API timed out after ${env.government.timeoutMs}ms`);
      }
      throw new GovernmentMarketDataError('request', 'Government API connection failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchRecentRecords(query: MarketQuery | undefined, scope: 'district' | 'state'): Promise<MarketPrice[]> {
    const candidateLimit = env.government.limit;
    const probe = await this.requestPage(query, scope, 1, 0);
    if (probe.total === 0) {
      if (process.env.NODE_ENV !== 'production') console.info('[market] government API returned an empty filtered dataset', { scope });
      return [];
    }

    let offset = calculateTailOffset(probe.total, candidateLimit);
    let page = await this.requestPage(query, scope, candidateLimit, offset);
    if (page.total !== probe.total) {
      offset = calculateTailOffset(page.total, candidateLimit);
      page = await this.requestPage(query, scope, candidateLimit, offset);
    }

    const prices: MarketPrice[] = [];
    let skippedMalformed = page.records.length === 0 && page.total > 0 ? 1 : 0;
    for (const record of page.records) {
      try {
        prices.push(toMarketPrice(record));
      } catch {
        skippedMalformed += 1;
      }
    }
    if (page.records.length > 0 && prices.length === 0) {
      console.warn('[market] government API candidate page contained no valid market records', {
        source: 'government',
        resourceId: env.government.resourceId,
        candidateCount: page.records.length,
        skippedMalformed,
      });
      throw new GovernmentMarketDataError('invalid_response', 'Government API returned no valid market records');
    }

    const unique = new Map<string, MarketPrice>();
    for (const price of prices) {
      const key = [price.commodity, price.market, price.variety, price.grade ?? '', price.date]
        .map((part) => part.trim().toLowerCase()).join('|');
      if (!unique.has(key)) unique.set(key, price);
    }
    const sorted = [...unique.values()].sort((left, right) =>
      (parseArrivalDate(right.date) ?? 0) - (parseArrivalDate(left.date) ?? 0));
    if (process.env.NODE_ENV !== 'production') {
      console.info('[market] government provider result', {
        source: 'government',
        fallback: false,
        resourceId: env.government.resourceId,
        candidateCount: page.records.length,
        recordCount: sorted.length,
        skippedMalformed,
        offset,
        total: page.total,
        latestArrivalDate: sorted[0]?.date ?? null,
        latestGuaranteed: false,
        unitVerified: sorted.every((record) => record.sourceUnit !== null),
      });
    }
    return sorted;
  }

  async getPrice(id: string): Promise<MarketPrice | undefined> {
    return (await this.getPrices()).find((price) => price.id === id);
  }
}
