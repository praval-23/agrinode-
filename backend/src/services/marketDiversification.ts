import type { MarketPrice } from '../types/market';

/**
 * Location-aware commodity diversification for government market records.
 *
 * Government feeds return many rows per commodity (multiple markets, varieties and
 * arrival dates). This module collapses them to one best record per commodity while
 * preserving strict location scoping:
 *  - district records always outrank state records
 *  - local markets (named after the user's city/district) are preferred
 *  - newest arrival_date wins where available
 *  - records with a valid normalized price win
 * No data is invented: selection only ever picks from genuine government records.
 */

export type DiversifiedSelection = {
  selected: MarketPrice[];
  districtRecordCount: number;
  stateRecordCount: number;
  districtUniqueCommodities: number;
  stateUniqueCommodities: number;
};

export function commodityKey(commodity: string): string {
  return commodity.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** AGMARKNET uses DD/MM/YYYY; some feeds use ISO dates. Returns epoch ms or null. */
export function parseArrivalDate(value: string): number | null {
  const trimmed = value.trim();
  const dayMonthYear = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dayMonthYear) {
    const time = Date.UTC(Number(dayMonthYear[3]), Number(dayMonthYear[2]) - 1, Number(dayMonthYear[1]));
    return Number.isFinite(time) ? time : null;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const time = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

/** Lower is better: 0 = market named after the user's city, 1 = their district, 2 = other. */
export function marketPreferenceScore(market: string, city?: string, district?: string): number {
  const normalizedMarket = market.trim().toLowerCase();
  if (city && normalizedMarket.includes(city.trim().toLowerCase())) return 0;
  if (district && normalizedMarket.includes(district.trim().toLowerCase().replace(/\s+urban$/, ''))) return 1;
  return 2;
}

function compareCandidates(left: MarketPrice, right: MarketPrice, city?: string, district?: string): number {
  const leftValidPrice = left.normalizedPricePerKg > 0 ? 0 : 1;
  const rightValidPrice = right.normalizedPricePerKg > 0 ? 0 : 1;
  if (leftValidPrice !== rightValidPrice) return leftValidPrice - rightValidPrice;
  const leftDate = parseArrivalDate(left.date) ?? Number.NEGATIVE_INFINITY;
  const rightDate = parseArrivalDate(right.date) ?? Number.NEGATIVE_INFINITY;
  if (leftDate !== rightDate) return rightDate - leftDate;
  const leftMarket = marketPreferenceScore(left.market, city, district);
  const rightMarket = marketPreferenceScore(right.market, city, district);
  if (leftMarket !== rightMarket) return leftMarket - rightMarket;
  return `${left.market}|${left.variety}`.localeCompare(`${right.market}|${right.variety}`);
}

/** One best record per commodity from a single scope's pool. */
export function bestRecordByCommodity(records: MarketPrice[], city?: string, district?: string): Map<string, MarketPrice> {
  const candidates = new Map<string, MarketPrice[]>();
  for (const record of records) {
    const key = commodityKey(record.commodity);
    const pool = candidates.get(key);
    if (pool) pool.push(record);
    else candidates.set(key, [record]);
  }
  const best = new Map<string, MarketPrice>();
  for (const [key, pool] of candidates) {
    pool.sort((left, right) => compareCandidates(left, right, city, district));
    best.set(key, pool[0]);
  }
  return best;
}

export function diversifyByCommodity(params: {
  districtRecords: MarketPrice[];
  stateRecords?: MarketPrice[];
  city?: string;
  district?: string;
}): DiversifiedSelection {
  const { districtRecords, stateRecords = [], city, district } = params;
  const districtBest = bestRecordByCommodity(districtRecords, city, district);
  const selected: MarketPrice[] = [];
  const usedKeys = new Set<string>();

  const districtPicks = [...districtBest.entries()].sort(([, left], [, right]) =>
    marketPreferenceScore(left.market, city, district) - marketPreferenceScore(right.market, city, district)
    || left.commodity.localeCompare(right.commodity));
  for (const [key, record] of districtPicks) {
    selected.push({ ...record, locationScope: 'district' });
    usedKeys.add(key);
  }

  const stateBest = bestRecordByCommodity(stateRecords, city, district);
  if (stateBest.size > 0) {
    const statePicks = [...stateBest.entries()]
      .filter(([key]) => !usedKeys.has(key))
      .sort(([, left], [, right]) => left.commodity.localeCompare(right.commodity));
    for (const [key, record] of statePicks) {
      selected.push({ ...record, locationScope: 'state' });
      usedKeys.add(key);
    }
  }

  return {
    selected,
    districtRecordCount: districtRecords.length,
    stateRecordCount: stateRecords.length,
    districtUniqueCommodities: districtBest.size,
    stateUniqueCommodities: stateBest.size,
  };
}
