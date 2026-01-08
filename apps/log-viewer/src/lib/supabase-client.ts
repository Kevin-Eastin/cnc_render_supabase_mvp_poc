/**
 * @file supabase-client.ts
 * @description Create a singleton Supabase client for browser usage.
 * @role Data access setup for the log viewer UI and auth.
 *
 * @pseudocode
 *  1. Load public Supabase environment variables.
 *  2. Create a typed Supabase client with auth enabled.
 *  3. Cache the client for reuse.
 *  4. Return the client to callers.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Database } from '$lib/database-types';

let browserClient: SupabaseClient<Database> | null = null;

/**
 * @function getSupabaseClient
 * @description Return a cached Supabase client for browser usage.
 * @param {None} _ - No parameters.
 * @returns {SupabaseClient<Database>} Supabase client instance.
 * @throws {Error} If required public env vars are missing.
 *
 * @behavior
 *  - Validate that PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY exist.
 *  - Create a Supabase client with persisted auth sessions.
 *  - Cache and return the client.
 *
 * @context
 *  Used by log data services and realtime subscriptions.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Missing public Supabase env vars for the log viewer.');
  }

  if (!browserClient) {
    // Avoid recreating the browser client on every call.
    browserClient = createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    });
  }

  return browserClient;
}
