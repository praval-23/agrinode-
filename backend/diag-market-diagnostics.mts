// Safe upstream check for Render Shell or local development.
// Run from the repository root with: npx tsx backend/diag-market-diagnostics.mts
import { env } from './src/config/env';
import {
  calculateTailOffset,
  governmentDiagnosticError,
  sanitizeGovernmentDiagnosticText,
} from './src/services/governmentMarketDataProvider';
import { parseArrivalDate } from './src/services/marketDiversification';

type Payload = { total?: unknown; records?: unknown };

function readTotal(value: unknown): number {
  const total = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid total field');
  return total;
}

function recordDate(record: unknown): string | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const value = (record as Record<string, unknown>).Arrival_Date;
  return typeof value === 'string' ? value : null;
}

async function main() {
  console.log('Configured provider:', env.marketDataProvider);
  console.log('Configured resource ID:', env.government.resourceId);
  console.log('New resource selected:', env.government.resourceId === '35985678-0d79-46b4-9ed6-6f13308a1d24');
  const apiBase = new URL(env.government.apiBaseUrl);
  console.log('API endpoint:', JSON.stringify({
    hostname: apiBase.hostname,
    endpointPath: `${apiBase.pathname.replace(/\/+$/, '')}/${encodeURIComponent(env.government.resourceId)}`,
  }));
  console.log('API key configured:', Boolean(env.government.apiKey));
  if (env.marketDataProvider !== 'government') throw new Error('MARKET_DATA_PROVIDER is not government');
  if (!env.government.apiKey) throw new Error('GOVERNMENT_API_KEY is not configured');

  const filters = { State: 'Karnataka', District: 'Bangalore', Commodity: 'Tomato' };
  const fetchPage = async (limit: number, offset: number) => {
    const url = new URL(`${env.government.apiBaseUrl}/${encodeURIComponent(env.government.resourceId)}`);
    const params = new URLSearchParams({
      'api-key': env.government.apiKey!,
      format: 'json',
      limit: String(limit),
      offset: String(offset),
    });
    for (const [field, value] of Object.entries(filters)) params.set(`filters[${field}]`, value);
    url.search = params.toString();
    const startedAt = Date.now();
    let httpStatus: number | null = null;
    let apiStatus: string | number | null = null;
    let apiMessage: string | null = null;
    let totalRecords: number | null = null;
    let returnedRecordCount: number | null = null;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(env.government.timeoutMs) });
      httpStatus = response.status;
      if (!response.ok) {
        try {
          const errorPayload: unknown = await response.clone().json();
          if (errorPayload && typeof errorPayload === 'object' && !Array.isArray(errorPayload)) {
            const body = errorPayload as Record<string, unknown>;
            apiStatus = typeof body.status === 'string' || typeof body.status === 'number'
              ? sanitizeGovernmentDiagnosticText(String(body.status))
              : null;
            apiMessage = typeof body.message === 'string' || typeof body.message === 'number'
              ? sanitizeGovernmentDiagnosticText(String(body.message))
              : null;
          }
        } catch {
          // Keep the HTTP status diagnostic when the error body is not JSON.
        }
        throw new Error(`Upstream returned HTTP ${response.status}`);
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Upstream returned malformed JSON');
      const parsed = payload as Payload;
      const body = payload as Record<string, unknown>;
      apiStatus = typeof body.status === 'string' || typeof body.status === 'number'
        ? sanitizeGovernmentDiagnosticText(String(body.status))
        : null;
      apiMessage = typeof body.message === 'string' || typeof body.message === 'number'
        ? sanitizeGovernmentDiagnosticText(String(body.message))
        : null;
      if (!Array.isArray(parsed.records)) throw new Error('Upstream response has no records array');
      totalRecords = readTotal(parsed.total);
      returnedRecordCount = parsed.records.length;
      console.info('[market-diagnostics] government API request', {
        resourceId: env.government.resourceId,
        apiHostname: apiBase.hostname,
        endpointPath: sanitizeGovernmentDiagnosticText(`${apiBase.pathname.replace(/\/+$/, '')}/${encodeURIComponent(env.government.resourceId)}`),
        apiKeyConfigured: Boolean(env.government.apiKey),
        filters,
        offset,
        limit,
        httpStatus,
        requestDurationMs: Date.now() - startedAt,
        apiStatus,
        apiMessage,
        totalRecords,
        returnedRecordCount,
        rejectedDuringNormalization: 0,
        result: 'success',
      });
      return { total: totalRecords, records: parsed.records };
    } catch (error) {
      const safeError = governmentDiagnosticError(error);
      console.error('[market-diagnostics] government API request failed', {
        resourceId: env.government.resourceId,
        apiHostname: apiBase.hostname,
        endpointPath: sanitizeGovernmentDiagnosticText(`${apiBase.pathname.replace(/\/+$/, '')}/${encodeURIComponent(env.government.resourceId)}`),
        apiKeyConfigured: Boolean(env.government.apiKey),
        filters,
        offset,
        limit,
        httpStatus,
        requestDurationMs: Date.now() - startedAt,
        apiStatus,
        apiMessage,
        totalRecords,
        returnedRecordCount,
        rejectedDuringNormalization: 0,
        ...safeError,
      });
      throw new Error(safeError.transportCategory ?? 'upstream request failed', { cause: error });
    }
  };

  const probe = await fetchPage(1, 0);
  let page = { total: probe.total, records: [] as unknown[] };
  if (probe.total > 0) {
    const candidateLimit = Math.min(env.government.limit, 5);
    const tailOffset = calculateTailOffset(probe.total, candidateLimit);
    page = await fetchPage(candidateLimit, tailOffset);
    if (page.total !== probe.total) {
      page = await fetchPage(candidateLimit, calculateTailOffset(page.total, candidateLimit));
    }
  }
  const records = page.records.filter((record) => record && typeof record === 'object' && !Array.isArray(record));
  const dates = records.map(recordDate).filter((date): date is string => date !== null);
  const latestDate = dates.reduce<string | null>((latest, date) =>
    parseArrivalDate(date) !== null && (latest === null || (parseArrivalDate(date) ?? 0) > (parseArrivalDate(latest) ?? 0)) ? date : latest, null);
  const verifiedGovernmentShape = records.length === 0 || records.every((record) => {
    const row = record as Record<string, unknown>;
    return typeof row.State === 'string' && typeof row.District === 'string'
      && typeof row.Commodity === 'string' && typeof row.Arrival_Date === 'string';
  });
  console.log('Filter summary:', JSON.stringify(filters));
  console.log('Government API total:', page.total);
  console.log('Tail-page records received:', records.length);
  console.log('Valid reporting dates:', dates.join(', ') || '(none)');
  console.log('Latest date in fetched candidates:', latestDate ?? '(none)');
  console.log('Government record field shape verified:', verifiedGovernmentShape);
  console.log('Global latest guaranteed:', false, '(dataset pagination is not chronological)');
  console.log('Price unit configured:', env.government.priceUnit ?? 'not verified; ₹/kg conversion disabled');
  if (!verifiedGovernmentShape) throw new Error('Returned records did not match the government dataset field shape');
}

main().catch((error: unknown) => {
  console.error('Market diagnostics failed:', governmentDiagnosticError(error));
  process.exitCode = 1;
});
