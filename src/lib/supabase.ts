import { createClient } from '@supabase/supabase-js';
import { env, hasSupabaseConfig } from './config';

export const supabase = hasSupabaseConfig
  ? createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
