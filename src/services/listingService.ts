import type { FarmerListing } from '@/types/listing';
export const createListing=(input:Omit<FarmerListing,'id'|'createdAt'|'status'|'verified'|'distanceKm'>):FarmerListing=>({...input,id:`LST-${Date.now()}`,createdAt:new Date().toISOString(),status:'ACTIVE',verified:true,distanceKm:24});
export const getFarmerListings=(all:FarmerListing[],farmerId:string)=>all.filter(x=>x.farmerId===farmerId);
export const getListings=(all:FarmerListing[])=>all;
export const getListingById=(all:FarmerListing[],id:string)=>all.find(x=>x.id===id);
export const updateListing=(all:FarmerListing[],id:string,patch:Partial<FarmerListing>)=>all.map(x=>x.id===id?{...x,...patch}:x);
export const deleteListing=(all:FarmerListing[],id:string)=>all.filter(x=>x.id!==id);
