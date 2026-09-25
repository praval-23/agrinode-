import { env } from '../config/env';
import type { CommerceRepository } from '../services/commerceRepository.types';
import { LocalJsonCommerceRepository } from './localCommerceRepository';
import { checkSupabaseConnection } from './supabaseClient';
import { SupabaseCommerceRepository } from './supabaseCommerceRepository';

export const commerceRepository: CommerceRepository = env.database.provider === 'supabase'
  ? new SupabaseCommerceRepository()
  : new LocalJsonCommerceRepository();

export const databaseProvider = env.database.provider;

export async function getDatabaseStatus(): Promise<{ databaseProvider: string; databaseStatus: 'local' | 'connected' | 'unavailable' }> {
  if (databaseProvider !== 'supabase') return { databaseProvider, databaseStatus: 'local' };
  return { databaseProvider, databaseStatus: await checkSupabaseConnection() ? 'connected' : 'unavailable' };
}
