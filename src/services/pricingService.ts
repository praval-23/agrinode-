import type { MarketDataProvider, MarketHistory, PriceUnit } from '@/types/market';
import { normalizePriceToKg as convert } from '@/utils/priceConversion';
import { getApiResponse } from './apiClient';
import type { UserLocation } from './locationService';
import { ApiMarketDataProvider, MockMarketDataProvider } from './marketDataProvider';
export type MarketDataSource='government'|'mock'|'mock-fallback';
export type MarketDataResult={prices:import('@/types/market').MarketPrice[];source:MarketDataSource;locationScope?:'district'|'state'|'none';error?:string};
const apiProvider=new ApiMarketDataProvider();
let provider:MarketDataProvider=apiProvider;
const fallbackProvider:MarketDataProvider=new MockMarketDataProvider();
export const setMarketDataProvider=(next:MarketDataProvider)=>{provider=next;};
export const normalizePriceToKg=(value:number,unit:PriceUnit,bagWeightKg?:number)=>convert(value,unit,bagWeightKg);
export const formatINR=(value:number)=>`\u20B9${value.toLocaleString('en-IN',{maximumFractionDigits:2})}`;
export const formatKgPrice=(value:number|null)=>value===null?'Unavailable':`\u20B9${value.toFixed(2)}/kg`;
export async function getMarketPricesWithStatus(location?: UserLocation):Promise<MarketDataResult>{try{if(provider===apiProvider){const result=await apiProvider.getPricesWithStatus(location);return {prices:result.prices,source:result.source,locationScope:result.locationScope,error:result.fallback?'Government data unavailable; using explicit mock fallback':undefined};}return {prices:await provider.getPrices(),source:'mock',locationScope:'none'};}catch(error){const prices=await fallbackProvider.getPrices();return {prices,source:'mock-fallback',locationScope:'none',error:error instanceof Error?error.message:'Backend request failed'};}}
export const getMarketPrices=async()=> (await getMarketPricesWithStatus()).prices;
export async function getCropPrice(id:string, location?: UserLocation){return (await getMarketPricesWithStatus(location)).prices.find(x=>x.id===id);}
export async function getPriceTrend(id:string){return (await getCropPrice(id))?.trend??[];}
export async function getMarketHistory(input:{commodity:string;market?:string;district?:string;state:string;days?:number}):Promise<MarketHistory>{
	const query = Object.entries({ ...input, days: input.days ?? 7 }).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
	const response = await getApiResponse<MarketHistory>(`/api/market/history?${query}`);
	return response.data;
}
