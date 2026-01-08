/**
 * @file 20250101000001_add_worker_status.sql
 * @description Add worker_status tracking and tighten log access policies.
 * @role Database schema migration for worker control and auth-only reads.
 *
 * @pseudocode
 *  1. Drop the open script_logs read policy.
 *  2. Create an authenticated-only read policy for script_logs.
 *  3. Create the worker_status table with status timestamps.
 *  4. Enable row level security on worker_status.
 *  5. Create an authenticated read policy for worker_status.
 *  6. Add worker_status to the realtime publication.
 */

drop policy if exists "Allow read access to script logs"
  on public.script_logs;

create policy "Allow read access to script logs"
  on public.script_logs
  for select
  to authenticated
  using (true);

create table if not exists public.worker_status (
  name text primary key,
  status text not null,
  message text,
  last_heartbeat timestamptz,
  last_started_at timestamptz,
  last_stopped_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.worker_status enable row level security;

create policy "Allow read access to worker status"
  on public.worker_status
  for select
  to authenticated
  using (true);

alter publication supabase_realtime add table public.worker_status;
