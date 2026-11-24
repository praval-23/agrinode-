import { env } from '../config/env';
import type { MarketDataProvider, MarketPrice, MarketQuery, PriceUnit } from '../types/market';
import { parseArrivalDate } from './marketDiversification';

type GovernmentRecord = Record<string, unknown>;
type GovernmentResponse = { total?: unknown; records?: unknown };
type GovernmentPage = {
  total: number;
  records: GovernmentRecord[];
  returnedRecordCount: number;
  rejectedRecordShapeCount: number;
};

const cache = new Map<string, { expiresAt: number; promise: Promise<MarketPrice[]> }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

export class GovernmentMarketDataError extends Error {
  constructor(
    public readonly kind: 'configuration' | 'timeout' | 'authentication' | 'rate_limit' | 'invalid_response' | 'request',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GovernmentMarketDataError';
  }
}

export function sanitizeGovernmentDiagnosticText(value: string): string {
  let sanitized = value.replace(/[\r\n\t]+/g, ' ').trim();
  const apiKey = env.government.apiKey;
  if (apiKey) sanitized = sanitized.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[REDACTED]');
  sanitized = sanitized
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[-_]?key|authorization|access[-_]?token|token|password)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (candidate) => {
      try {
        const url = new URL(candidate);
        return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
      } catch {
        return '[REDACTED_URL]';
      }
    });
  return sanitized.slice(0, 500);
}

export function governmentDiagnosticError(error: unknown) {
  const causes: Array<{ name: string; code: string | null; message: string }> = [];
  let current: unknown = error;
  let depth = 0;
  while (current && typeof current === 'object' && depth < 5) {
    const item = current as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
    const cause = item.cause;
    if (depth > 0) {
      causes.push({
        name: typeof item.name === 'string' ? sanitizeGovernmentDiagnosticText(item.name) : 'Error',
        code: typeof item.code === 'string' || typeof item.code === 'number' ? sanitizeGovernmentDiagnosticText(String(item.code)) : null,
        message: typeof item.message === 'string' ? sanitizeGovernmentDiagnosticText(item.message) : 'No error message',
      });
    }
    current = cause;
    depth += 1;
  }
  const root = error && typeof error === 'object'
    ? error as { name?: unknown; code?: unknown; message?: unknown }
    : undefined;
  const codes = [root?.code, ...causes.map((cause) => cause.code)].filter((code): code is string | number => typeof code === 'string' || typeof code === 'number');
  const messages = [root?.message, ...causes.map((cause) => cause.message)].filter((message): message is string => typeof message === 'string');
  const codeText = codes.map(String).join(' ').toUpperCase();
  const messageText = messages.join(' ').toLowerCase();
  let transportCategory: 'timeout' | 'dns' | 'tls' | 'connection' | null = null;
  if (codeText.includes('TIMEOUT') || error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    || messageText.includes('timed out') || messageText.includes('timeout')) {
    transportCategory = 'timeout';
  } else if (/\b(ENOTFOUND|EAI_AGAIN|EAI_FAIL)\b/.test(codeText) || messageText.includes('getaddrinfo')) {
    transportCategory = 'dns';
  } else if (/TLS|CERT|SSL|UNABLE_TO_VERIFY/.test(codeText) || /tls|certificate|ssl handshake/.test(messageText)) {
    transportCategory = 'tls';
  } else if (/ECONN|SOCKET|UND_ERR_CONNECT/.test(codeText) || /connection|socket|network/.test(messageText)) {
    transportCategory = 'connection';
  }

  return {
    errorName: root && typeof root.name === 'string' ? sanitizeGovernmentDiagnosticText(root.name) : 'Error',
    errorCode: root && (typeof root.code === 'string' || typeof root.code === 'number')
      ? sanitizeGovernmentDiagnosticText(String(root.code))
      : null,
    errorMessage: root && typeof root.message === 'string' ? sanitizeGovernmentDiagnosticText(root.message) : sanitizeGovernmentDiagnosticText(String(error)),
    nestedErrorCause: causes,
    transportCategory,
  };
}

function requestDiagnostics(query: MarketQuery | undefined, scope: 'district' | 'state') {
  let apiHostname: string | null = null;
  let endpointPath: string | null = null;
  try {
    const baseUrl = new URL(env.government.apiBaseUrl);
    apiHostname = baseUrl.hostname;
    endpointPath = `${baseUrl.pathname.replace(/\/+$/, '')}/${encodeURIComponent(env.government.resourceId)}`;
  } catch {
    // The failed URL construction is logged by the request handler with the remaining safe context.
  }
  const filters: Record<string, string> = {};
  if (query?.state) filters.State = query.state;
  if (scope === 'district' && query?.district) filters.District = governmentDistrictName(query.district);
  if (query?.commodity) filters.Commodity = query.commodity;
  if (query?.market) filters.Market = query.market;
  return {
    resourceId: sanitizeGovernmentDiagnosticText(env.government.resourceId),
    apiHostname: apiHostname ? sanitizeGovernmentDiagnosticText(apiHostname) : null,
    endpointPath: endpointPath ? sanitizeGovernmentDiagnosticText(endpointPath) : null,
    apiKeyConfigured: Boolean(env.government.apiKey),
    filters: Object.fromEntries(Object.entries(filters).map(([field, value]) => [field, sanitizeGovernmentDiagnosticText(value)])),
  };
}

function apiResponseDiagnostics(payload: unknown): { apiStatus: string | number | null; apiMessage: string | null } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { apiStatus: null, apiMessage: null };
  const response = payload as Record<string, unknown>;
  const status = response.status;
  const message = response.message;
  return {
    apiStatus: typeof status === 'string' || typeof status === 'number' ? sanitizeGovernmentDiagnosticText(String(status)) : null,
    apiMessage: typeof message === 'string' || typeof message === 'number' ? sanitizeGovernmentDiagnosticText(String(message)) : null,
  };
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
    const scope = options?.scope ?? 'state';
    try {
      requiredApiKey();
    } catch (error) {
      const diagnostics = requestDiagnostics(query, scope);
      console.error('[market] government API request failed', {
        ...diagnostics,
        limit: env.government.limit,
        offset: 0,
        httpStatus: null,
        requestDurationMs: 0,
        apiStatus: null,
        apiMessage: null,
        totalRecords: null,
        returnedRecordCount: null,
        rejectedDuringNormalization: 0,
        reason: 'api_key_not_configured',
        ...governmentDiagnosticError(error),
      });
      throw error;
    }
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
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.government.timeoutMs);
    const diagnostics = requestDiagnostics(query, scope);
    let responseStatus: number | null = null;
    let apiStatus: string | number | null = null;
    let apiMessage: string | null = null;
    let totalRecords: number | null = null;
    let returnedRecordCount: number | null = null;
    let rejectedRecordShapeCount = 0;
    const logRequest = (result: 'success' | 'failure', reason?: string, error?: unknown) => {
      const log = result === 'success' ? console.info : console.error;
      log('[market] government API request', {
        ...diagnostics,
        limit,
        offset,
        httpStatus: responseStatus,
        requestDurationMs: Date.now() - startedAt,
        apiStatus,
        apiMessage,
        totalRecords,
        returnedRecordCount,
        rejectedRecordShapeCount,
        rejectedDuringNormalization: 0,
        result,
        reason: reason ?? null,
        ...(error === undefined ? {} : governmentDiagnosticError(error)),
      });
    };
    try {
      const requestUrl = buildGovernmentRequestUrl(query, scope, limit, offset);
      const response = await fetch(requestUrl, { signal: controller.signal });
      responseStatus = response.status;
      if (!response.ok) {
        try {
          const errorPayload: unknown = await response.clone().json();
          ({ apiStatus, apiMessage } = apiResponseDiagnostics(errorPayload));
          if (errorPayload && typeof errorPayload === 'object' && !Array.isArray(errorPayload)) {
            const total = (errorPayload as GovernmentResponse).total;
            if (total !== undefined) totalRecords = parseTotal(total);
          }
        } catch {
          // Non-JSON HTTP error bodies are represented by their HTTP status and sanitized error below.
        }
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
        ({ apiStatus, apiMessage } = apiResponseDiagnostics(parsed));
      } catch (error) {
        throw new GovernmentMarketDataError('invalid_response', 'Government API returned invalid JSON', { cause: error });
      }
      if (!Array.isArray(payload.records)) {
        throw new GovernmentMarketDataError('invalid_response', 'Government API response did not contain a records array');
      }
      const total = parseTotal(payload.total);
      totalRecords = total;
      returnedRecordCount = payload.records.length;
      const records = payload.records.filter((record): record is GovernmentRecord =>
        Boolean(record) && typeof record === 'object' && !Array.isArray(record));
      rejectedRecordShapeCount = payload.records.length - records.length;
      logRequest('success');
      return { total, records, returnedRecordCount: payload.records.length, rejectedRecordShapeCount };
    } catch (error) {
      let reportedError = error;
      if (!(error instanceof GovernmentMarketDataError)) {
        if ((error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
          || (error instanceof DOMException && error.name === 'AbortError')) {
          reportedError = new GovernmentMarketDataError('timeout', `Government API timed out after ${env.government.timeoutMs}ms`, { cause: error });
        } else {
          reportedError = new GovernmentMarketDataError('request', 'Government API connection failed', { cause: error });
        }
      }
      logRequest('failure', reportedError instanceof GovernmentMarketDataError ? reportedError.kind : 'request_failed', reportedError);
      throw reportedError;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchRecentRecords(query: MarketQuery | undefined, scope: 'district' | 'state'): Promise<MarketPrice[]> {
    const candidateLimit = env.government.limit;
    const probe = await this.requestPage(query, scope, 1, 0);
    if (probe.total === 0) {
      console.warn('[market] government provider returned no records', {
        ...requestDiagnostics(query, scope),
        reason: 'upstream_total_is_zero',
        totalRecords: probe.total,
        returnedRecordCount: probe.returnedRecordCount,
        rejectedDuringNormalization: probe.rejectedRecordShapeCount,
      });
      return [];
    }

    let offset = calculateTailOffset(probe.total, candidateLimit);
    let page = await this.requestPage(query, scope, candidateLimit, offset);
    if (page.total !== probe.total) {
      offset = calculateTailOffset(page.total, candidateLimit);
      page = await this.requestPage(query, scope, candidateLimit, offset);
    }

    const prices: MarketPrice[] = [];
    let skippedMalformed = page.rejectedRecordShapeCount;
    const normalizationRejections: Record<string, number> = {};
    for (const record of page.records) {
      try {
        prices.push(toMarketPrice(record));
      } catch (error) {
        skippedMalformed += 1;
        const reason = error instanceof GovernmentMarketDataError ? error.message : 'Unexpected normalization error';
        normalizationRejections[sanitizeGovernmentDiagnosticText(reason)] = (normalizationRejections[sanitizeGovernmentDiagnosticText(reason)] ?? 0) + 1;
      }
    }
    if (page.records.length > 0 && prices.length === 0) {
      const error = new GovernmentMarketDataError('invalid_response', 'Government API returned no valid market records');
      console.error('[market] government provider returned no records', {
        ...requestDiagnostics(query, scope),
        reason: 'all_candidate_records_rejected_during_normalization',
        candidateCount: page.records.length,
        totalRecords: page.total,
        returnedRecordCount: page.returnedRecordCount,
        rejectedDuringNormalization: skippedMalformed,
        normalizationRejections,
        ...governmentDiagnosticError(error),
      });
      throw error;
    }

    const unique = new Map<string, MarketPrice>();
    for (const price of prices) {
      const key = [price.commodity, price.market, price.variety, price.grade ?? '', price.date]
        .map((part) => part.trim().toLowerCase()).join('|');
      if (!unique.has(key)) unique.set(key, price);
    }
    const sorted = [...unique.values()].sort((left, right) =>
      (parseArrivalDate(right.date) ?? 0) - (parseArrivalDate(left.date) ?? 0));
    console.info('[market] government provider result', {
      ...requestDiagnostics(query, scope),
      reason: sorted.length > 0
        ? 'records_normalized'
        : page.returnedRecordCount === 0 && page.total > 0
          ? 'upstream_page_returned_no_records_with_nonzero_total'
          : 'no_records_after_normalization',
      offset,
      limit: candidateLimit,
      totalRecords: page.total,
      returnedRecordCount: page.returnedRecordCount,
      candidateRecordCount: page.records.length,
      normalizedRecordCount: sorted.length,
      rejectedDuringNormalization: skippedMalformed,
      normalizationRejections,
      latestArrivalDate: sorted[0]?.date ?? null,
      latestGuaranteed: false,
      unitVerified: sorted.every((record) => record.sourceUnit !== null),
    });
    return sorted;
  }

  async getPrice(id: string): Promise<MarketPrice | undefined> {
    return (await this.getPrices()).find((price) => price.id === id);
  }
}
