import type { MarketHistory, MarketPrice } from '../types/market';
import { commodityKey, parseArrivalDate } from './marketDiversification';

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sameMarket(left: MarketPrice, market: string): boolean {
  return left.market.trim().toLowerCase() === market.trim().toLowerCase();
}

function betterRecord(left: MarketPrice, right: MarketPrice): MarketPrice {
  const leftDate = parseArrivalDate(left.date) ?? Number.NEGATIVE_INFINITY;
  const rightDate = parseArrivalDate(right.date) ?? Number.NEGATIVE_INFINITY;
  if (left.normalizedPricePerKg > 0 && right.normalizedPricePerKg <= 0) return left;
  if (right.normalizedPricePerKg > 0 && left.normalizedPricePerKg <= 0) return right;
  return leftDate >= rightDate ? left : right;
}

export function buildMarketHistory(records: MarketPrice[], options: {
  commodity: string;
  market?: string;
  days: number;
  locationScope: MarketHistory['locationScope'];
  source: MarketHistory['source'];
}): MarketHistory {
  const commodity = commodityKey(options.commodity);
  const matching = records.filter((record) => commodityKey(record.commodity) === commodity && (!options.market || sameMarket(record, options.market)) && record.normalizedPricePerKg > 0 && parseArrivalDate(record.date) !== null);
  const byDate = new Map<string, MarketPrice>();
  for (const record of matching) {
    const existing = byDate.get(record.date);
    byDate.set(record.date, existing ? betterRecord(existing, record) : record);
  }
  const ordered = [...byDate.values()].sort((left, right) => (parseArrivalDate(left.date) ?? 0) - (parseArrivalDate(right.date) ?? 0));
  const latestDate = parseArrivalDate(ordered.at(-1)?.date ?? '') ?? null;
  const minimumDate = latestDate === null ? null : latestDate - Math.max(1, options.days) * 24 * 60 * 60 * 1000;
  const points = ordered.filter((record) => minimumDate === null || (parseArrivalDate(record.date) ?? 0) >= minimumDate).map((record) => ({ date: record.date, price: round(record.normalizedPricePerKg) }));
  const current = points.at(-1)?.price ?? null;
  const previous = points.length > 1 ? points.at(-2)!.price : null;
  const change = current !== null && previous !== null ? round(current - previous) : null;
  const changePercent = change !== null && previous !== null && previous !== 0 ? round((change / previous) * 100) : null;
  return { commodity: options.commodity, market: options.market ?? ordered.at(-1)?.market ?? '', currentPrice: current, previousPrice: previous, change, changePercent, history: points, demand: null, source: options.source, locationScope: options.locationScope };
}