/**
 * @file log-service.ts
 * @description Query and subscribe to script log data from Supabase.
 * @role Client-side data access layer for the log viewer UI.
 *
 * @pseudocode
 *  1. Fetch recent log rows ordered by time.
 *  2. Normalize results and surface errors.
 *  3. Subscribe to realtime insert events.
 *  4. Provide an unsubscribe helper for cleanup.
 */

import type { ScriptLog } from '$lib/database-types';
import { getSupabaseClient } from '$lib/supabase-client';

export type LogFetchResult = {
  data: ScriptLog[];
  errorMessage: string | null;
};

export type LogSubscription = {
  unsubscribe: () => void;
  errorMessage: string | null;
};

/**
 * @function fetchRecentLogs
 * @description Fetch the most recent script logs from Supabase.
 * @param {number} limit - Max number of log rows to return.
 * @returns {Promise<LogFetchResult>} Logs and optional error message.
 * @throws {Error} If the Supabase client cannot be created.
 *
 * @behavior
 *  - Guard against non-positive limits.
 *  - Query script_logs ordered by created_at desc.
 *  - Return data or error message.
 *
 * @context
 *  Called on page load to hydrate the initial log list.
 */
export async function fetchRecentLogs(limit: number): Promise<LogFetchResult> {
  const safeLimit = limit > 0 ? limit : 50;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('script_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    return { data: [], errorMessage: error.message };
  }

  return { data: data ?? [], errorMessage: null };
}

/**
 * @function subscribeToLogInserts
 * @description Subscribe to realtime log inserts.
 * @param {(log: ScriptLog) => void} onInsert - Callback for new logs.
 * @returns {LogSubscription} Unsubscribe helper and error message.
 * @throws {Error} If the Supabase client cannot be created.
 *
 * @behavior
 *  - Create a realtime channel for script_logs inserts.
 *  - Invoke the callback with new log rows.
 *  - Return an unsubscribe function for cleanup.
 *
 * @context
 *  Used by the UI to keep the log list live.
 */
export function subscribeToLogInserts(
  onInsert: (log: ScriptLog) => void
): LogSubscription {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel('script-logs-insert')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'script_logs' },
      (payload) => {
        onInsert(payload.new as ScriptLog);
      }
    )
    .subscribe();

  return {
    errorMessage: null,
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    }
  };
}
