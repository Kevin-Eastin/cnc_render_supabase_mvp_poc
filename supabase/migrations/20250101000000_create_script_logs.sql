/**
 * @file 20250101000000_create_script_logs.sql
 * @description Create the script_logs table with RLS and realtime support.
 * @role Database schema migration for log storage and read access.
 *
 * @pseudocode
 *  1. Ensure required extensions exist.
 *  2. Create the script_logs table with defaults.
 *  3. Enable row level security on the table.
 *  4. Create a read policy for anon and authenticated users.
 *  5. Add the table to the realtime publication.
 */

create extension if not exists "pgcrypto";

create table if not exists public.script_logs (
  id uuid primary key default gen_random_uuid(),
  script_name text not null,
  level text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.script_logs enable row level security;

create policy "Allow read access to script logs"
  on public.script_logs
  for select
  using (true);

alter publication supabase_realtime add table public.script_logs;
