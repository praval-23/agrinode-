import type { PriceUnit } from '@/types/market';
/** Normalizes a supported mandi source quote to rupees per kilogram. Bags require their known kg weight. */
export function normalizePriceToKg(price:number,unit:PriceUnit,bagWeightKg=50):number { if(price<0) return 0; if(unit==='quintal'||unit==='100kg') return price/100; if(unit==='tonne') return price/1000; if(unit==='bag') return price/Math.max(1,bagWeightKg); return price; }
export function calculateChangePercent(current:number,previous:number):number { return previous<=0?0:((current-previous)/previous)*100; }
