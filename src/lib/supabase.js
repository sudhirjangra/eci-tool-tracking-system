import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const primaryStorageKey = 'sb-election-dashboard-auth-token';
const adminStorageKey = 'sb-election-dashboard-admin-auth-token';

console.log('[Supabase] Initializing client with URL:', supabaseUrl);

// Single instance for the logged-in user - reused across all components
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: primaryStorageKey,
  },
  realtime: {
    params: {
      eventsPerSecond: 60, // Support higher update throughput under concurrent load
    }
  }
});

// Optional: "Silent" client for admin operations (disabled channel subscriptions)
export const supabaseAdminAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: adminStorageKey,
  },
  realtime: {
    params: {
      eventsPerSecond: 60,
    }
  }
});