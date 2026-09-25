export type MarketLocation = { district: string; state: string; latitude: number; longitude: number };

const locations: Record<string, MarketLocation> = {
  Nizamabad: { district: 'Nizamabad', state: 'Telangana', latitude: 18.6725, longitude: 78.0941 },
  Hyderabad: { district: 'Hyderabad', state: 'Telangana', latitude: 17.385, longitude: 78.4867 },
  Kolar: { district: 'Kolar', state: 'Karnataka', latitude: 13.1367, longitude: 78.1292 },
  Bengaluru: { district: 'Bengaluru Urban', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
  Mysuru: { district: 'Mysuru', state: 'Karnataka', latitude: 12.2958, longitude: 76.6394 },
  Tumakuru: { district: 'Tumakuru', state: 'Karnataka', latitude: 13.3392, longitude: 77.101 },
  Hassan: { district: 'Hassan', state: 'Karnataka', latitude: 13.0033, longitude: 76.1004 },
  Mumbai: { district: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777 },
  Pune: { district: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567 },
  Delhi: { district: 'Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.209 },
  Bodhan: { district: 'Nizamabad', state: 'Telangana', latitude: 18.662, longitude: 77.892 },
  Khammam: { district: 'Khammam', state: 'Telangana', latitude: 17.2473, longitude: 80.1514 },
  Warangal: { district: 'Warangal', state: 'Telangana', latitude: 17.9784, longitude: 79.5941 },
  Adilabad: { district: 'Adilabad', state: 'Telangana', latitude: 19.6641, longitude: 78.532 },
  Medak: { district: 'Medak', state: 'Telangana', latitude: 18.0453, longitude: 78.2608 },
};

export function getMarketLocation(market: string): MarketLocation | undefined {
  if (locations[market]) return locations[market];
  const normalized = market.toLowerCase().replace(/\bapmc\b/g, '').replace(/[^a-z0-9]/g, '');
  return Object.entries(locations).find(([name]) => name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized)?.[1];
}

const demoMarketByCommodityId: Record<string, keyof typeof locations> = {
  tomato: 'Nizamabad', onion: 'Hyderabad', potato: 'Kolar', wheat: 'Bengaluru',
  maize: 'Tumakuru', cotton: 'Mysuru', chilli: 'Hassan', turmeric: 'Nizamabad',
  groundnut: 'Mumbai', paddy: 'Pune', soybean: 'Delhi', sugarcane: 'Bengaluru',
  cabbage: 'Hyderabad', cauliflower: 'Kolar', carrot: 'Nizamabad',
};

export function getDemoMarketLocation(commodityId: string): MarketLocation | undefined {
  const market = demoMarketByCommodityId[commodityId];
  return market ? locations[market] : undefined;
}

export function getDemoMarketName(commodityId: string): string | undefined {
  return demoMarketByCommodityId[commodityId];
}