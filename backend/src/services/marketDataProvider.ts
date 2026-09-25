import type { Demand, MarketDataProvider, MarketPrice, MarketQuery, PriceUnit } from '../types/market';
import { getDemoMarketLocation, getDemoMarketName } from '../data/marketLocations';

type MockCommodity = {
  id: string;
  name: string;
  category: string;
  icon: string;
  sourcePrice: number;
  sourceUnit: PriceUnit;
  changePercent: number;
  trend: number[];
  market: string;
  demand: Demand;
};

const lastUpdated = '2026-09-09T10:30:00.000Z';

const commodities: MockCommodity[] = [
  ['tomato', 'Tomato', 'Vegetable', 'TO', 2850, 'quintal', 4.8, [38, 44, 41, 53, 58, 68, 74], 'Nizamabad', 'High'],
  ['onion', 'Onion', 'Vegetable', 'ON', 2230, 'quintal', -2.1, [66, 62, 65, 57, 52, 48, 45], 'Nizamabad', 'Medium'],
  ['potato', 'Potato', 'Vegetable', 'PO', 1675, 'quintal', 1.3, [38, 37, 42, 43, 45, 46, 49], 'Hyderabad', 'Medium'],
  ['wheat', 'Wheat', 'Cereal', 'WH', 2460, 'quintal', 0.9, [44, 43, 45, 46, 48, 47, 50], 'Nizamabad', 'High'],
  ['maize', 'Maize', 'Cereal', 'MA', 1820, 'quintal', 2.4, [36, 38, 40, 39, 43, 47, 50], 'Bodhan', 'High'],
  ['cotton', 'Cotton', 'Fibre', 'CO', 5680, 'quintal', -1.2, [68, 67, 65, 66, 61, 60, 58], 'Nizamabad', 'Medium'],
  ['chilli', 'Chilli', 'Spice', 'CH', 4230, 'quintal', 3.6, [34, 39, 37, 45, 48, 54, 59], 'Khammam', 'High'],
  ['turmeric', 'Turmeric', 'Spice', 'TU', 8840, 'quintal', 5.2, [32, 37, 42, 48, 54, 61, 70], 'Nizamabad', 'High'],
  ['groundnut', 'Groundnut', 'Oilseed', 'GN', 6210, 'quintal', 1.8, [36, 38, 39, 43, 45, 47, 51], 'Warangal', 'Medium'],
  ['paddy', 'Paddy', 'Cereal', 'PA', 2075, 'quintal', 1.1, [42, 43, 42, 45, 47, 48, 50], 'Nizamabad', 'High'],
  ['soybean', 'Soybean', 'Oilseed', 'SO', 4520, 'quintal', 2.7, [34, 36, 39, 42, 43, 49, 53], 'Adilabad', 'Medium'],
  ['sugarcane', 'Sugarcane', 'Cash crop', 'SC', 3400, 'tonne', 0.6, [42, 43, 44, 43, 45, 46, 47], 'Medak', 'Medium'],
  ['cabbage', 'Cabbage', 'Vegetable', 'CA', 1250, 'quintal', -1.7, [63, 60, 59, 56, 55, 52, 50], 'Hyderabad', 'Low'],
  ['cauliflower', 'Cauliflower', 'Vegetable', 'CF', 2630, 'quintal', 2.2, [37, 39, 38, 44, 46, 48, 52], 'Hyderabad', 'Medium'],
  ['carrot', 'Carrot', 'Vegetable', 'CR', 3150, 'quintal', 1.6, [38, 39, 42, 41, 46, 47, 50], 'Nizamabad', 'Medium'],
].map(([id, name, category, icon, sourcePrice, sourceUnit, changePercent, trend, market, demand]) => ({
  id: id as string,
  name: name as string,
  category: category as string,
  icon: icon as string,
  sourcePrice: sourcePrice as number,
  sourceUnit: sourceUnit as PriceUnit,
  changePercent: changePercent as number,
  trend: trend as number[],
  market: market as string,
  demand: demand as Demand,
}));

function normalizePriceToKg(price: number, unit: PriceUnit): number {
  if (unit === 'quintal' || unit === '100kg') return price / 100;
  if (unit === 'tonne') return price / 1000;
  return price;
}

export class MockMarketDataProvider implements MarketDataProvider {
  async getPrices(_query?: MarketQuery): Promise<MarketPrice[]> {
    return commodities.map((commodity) => {
      const normalizedPricePerKg = normalizePriceToKg(commodity.sourcePrice, commodity.sourceUnit);
      const previousPricePerKg = normalizedPricePerKg / (1 + commodity.changePercent / 100);
      const location = getDemoMarketLocation(commodity.id);

      return {
        id: commodity.id,
        name: commodity.name,
        category: commodity.category,
        commodity: commodity.name,
        variety: 'Grade A',
        market: getDemoMarketName(commodity.id) ?? commodity.market,
        district: location?.district ?? 'Nizamabad',
        state: location?.state ?? 'Telangana',
        date: '2026-09-09',
        sourcePrice: commodity.sourcePrice,
        sourceUnit: commodity.sourceUnit,
        minPrice: Math.round(commodity.sourcePrice * 0.91),
        maxPrice: Math.round(commodity.sourcePrice * 1.08),
        modalPrice: commodity.sourcePrice,
        normalizedPricePerKg,
        previousPricePerKg,
        changePercent: commodity.changePercent,
        trend: commodity.trend,
        demand: commodity.demand,
        source: 'Mock',
        lastUpdated,
        icon: commodity.icon,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      };
    });
  }

  async getPrice(id: string): Promise<MarketPrice | undefined> {
    return (await this.getPrices()).find((price) => price.id === id);
  }
}