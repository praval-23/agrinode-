// Safe upstream check for Render Shell or local development.
// Run from the repository root with: npx tsx backend/diag-market-diagnostics.mts
import { env } from './src/config/env';
import { calculateTailOffset } from './src/services/governmentMarketDataProvider';
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
  console.log('Configured API host:', new URL(env.government.apiBaseUrl).host);
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
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(env.government.timeoutMs) });
      const responseTimeMs = Date.now() - startedAt;
      console.log('Upstream HTTP status:', response.status, '| response time:', `${responseTimeMs}ms`);
      if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Upstream returned malformed JSON');
      const parsed = payload as Payload;
      if (!Array.isArray(parsed.records)) throw new Error('Upstream response has no records array');
      return { total: readTotal(parsed.total), records: parsed.records };
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith('Upstream returned HTTP'))) {
        console.log('Upstream HTTP status: no response | response time:', `${Date.now() - startedAt}ms`);
      }
      const errorClass = error instanceof Error && error.name === 'TimeoutError'
        ? 'timeout'
        : error instanceof Error && error.message.startsWith('Upstream returned HTTP')
          ? error.message
          : error instanceof Error && (error.message.includes('malformed') || error.message.includes('Invalid total'))
            ? 'malformed or invalid response'
            : error instanceof Error && error.message.includes('records array')
              ? 'invalid response shape'
              : 'connection or response error';
      console.error('Sanitized upstream error:', errorClass);
      throw new Error(errorClass);
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
  const message = error instanceof Error ? error.message : 'diagnostic failed';
  console.error('Market diagnostics failed:', message);
  process.exitCode = 1;
});
