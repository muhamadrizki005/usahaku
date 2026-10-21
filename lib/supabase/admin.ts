import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseConfig } from './config';

export function createAdminClient() {
  const { url } = requireSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Kunci server untuk pengelolaan staf belum diatur.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
