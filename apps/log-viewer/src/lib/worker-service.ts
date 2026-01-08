/**
 * @file worker-service.ts
 * @description Fetch worker status data and trigger worker actions.
 * @role Client-side data access for worker control and status updates.
 *
 * @pseudocode
 *  1. Query worker_status rows from Supabase.
 *  2. Subscribe to realtime status updates.
 *  3. Build worker API URLs from public env vars.
 *  4. Send authenticated start/stop requests.
 */

import { PUBLIC_WORKER_API_URL } from '$env/static/public';
import type { WorkerStatus } from '$lib/database-types';
import { getSupabaseClient } from '$lib/supabase-client';

export type WorkerStatusResult = {
  data: WorkerStatus[];
  errorMessage: string | null;
};

export type WorkerStatusSubscription = {
  unsubscribe: () => void;
  errorMessage: string | null;
};

export type WorkerAction = 'start' | 'stop';

export type WorkerActionResult = {
  data: WorkerStatus | null;
  errorMessage: string | null;
};

/**
 * @function fetchWorkerStatus
 * @description Fetch the latest worker status rows from Supabase.
 * @param {None} _ - No parameters.
 * @returns {Promise<WorkerStatusResult>} Worker statuses or an error message.
 * @throws {Error} If the Supabase client cannot be created.
 *
 * @behavior
 *  - Query worker_status ordered by name.
 *  - Return data or error message.
 *  - Default to an empty list on failure.
 *
 * @context
 *  Used when the dashboard loads or auth state changes.
 */
export async function fetchWorkerStatus(): Promise<WorkerStatusResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('worker_status')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    return { data: [], errorMessage: error.message };
  }

  return { data: data ?? [], errorMessage: null };
}

/**
 * @function subscribeToWorkerStatus
 * @description Subscribe to realtime worker status inserts and updates.
 * @param {(status: WorkerStatus) => void} onChange - Callback for updates.
 * @returns {WorkerStatusSubscription} Unsubscribe helper and error message.
 * @throws {Error} If the Supabase client cannot be created.
 *
 * @behavior
 *  - Create a realtime channel for worker_status changes.
 *  - Invoke callback with the updated row payload.
 *  - Return an unsubscribe helper.
 *
 * @context
 *  Keeps the UI in sync with worker start/stop events.
 */
export function subscribeToWorkerStatus(
  onChange: (status: WorkerStatus) => void
): WorkerStatusSubscription {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel('worker-status-updates')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'worker_status' },
      (payload) => {
        onChange(payload.new as WorkerStatus);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'worker_status' },
      (payload) => {
        onChange(payload.new as WorkerStatus);
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

/**
 * @function requestWorkerAction
 * @description Send a start or stop command to the worker API.
 * @param {object} params - Action parameters.
 * @param {string} params.workerName - Target worker name.
 * @param {WorkerAction} params.action - Action to perform.
 * @param {string} params.accessToken - Supabase auth token.
 * @param {number} [params.timeoutMs=12000] - Request timeout in ms.
 * @returns {Promise<WorkerActionResult>} Action result or error message.
 * @throws {Error} If the worker API URL is not configured.
 *
 * @behavior
 *  - Build the worker API URL.
 *  - Send a POST request with bearer auth.
 *  - Abort the request after the timeout.
 *
 * @context
 *  Triggered by the Start/Stop controls in the dashboard.
 */
export async function requestWorkerAction({
  workerName,
  action,
  accessToken,
  timeoutMs = 12000
}: {
  workerName: string;
  action: WorkerAction;
  accessToken: string;
  timeoutMs?: number;
}): Promise<WorkerActionResult> {
  if (!PUBLIC_WORKER_API_URL) {
    throw new Error('Missing PUBLIC_WORKER_API_URL for worker actions.');
  }

  const endpoint = buildWorkerEndpoint(PUBLIC_WORKER_API_URL, workerName, action);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      signal: controller.signal
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return {
        data: null,
        errorMessage: payload?.error ?? 'Unable to update worker status.'
      };
    }

    return { data: payload as WorkerStatus, errorMessage: null };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Worker API request timed out.'
        : error instanceof Error
          ? error.message
          : 'Unknown error.';
    return { data: null, errorMessage: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @function buildWorkerEndpoint
 * @description Build the worker API endpoint URL.
 * @param {string} baseUrl - Base API URL.
 * @param {string} workerName - Target worker name.
 * @param {WorkerAction} action - Action to perform.
 * @returns {string} Full endpoint URL.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Trim trailing slashes from the base URL.
 *  - Encode the worker name for URL usage.
 *  - Append the action path segment.
 *
 * @context
 *  Shared helper for worker API requests.
 */
function buildWorkerEndpoint(
  baseUrl: string,
  workerName: string,
  action: WorkerAction
): string {
  const normalizedBase = baseUrl.replace(/\/+$/g, '');
  const encodedName = encodeURIComponent(workerName.trim());
  return `${normalizedBase}/workers/${encodedName}/${action}`;
}

/**
 * @function readJson
 * @description Safely parse a JSON response body.
 * @param {Response} response - Fetch response instance.
 * @returns {Promise<unknown | null>} Parsed payload or null.
 * @throws {Error} Never throws.
 *
 * @behavior
 *  - Attempt to parse JSON from the response body.
 *  - Return null when parsing fails.
 *  - Avoid throwing for empty responses.
 *
 * @context
 *  Used to normalize error handling for fetch requests.
 */
async function readJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
