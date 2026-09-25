import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (env.database.provider !== 'supabase') throw new Error('Supabase database provider is not enabled');
  if (!env.database.supabaseUrl || !env.database.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DATABASE_PROVIDER=supabase');
  }
  client ??= createClient(env.database.supabaseUrl, env.database.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('profiles').select('id', { head: true, count: 'exact' });
    return !error;
  } catch {
    return false;
  }
}
