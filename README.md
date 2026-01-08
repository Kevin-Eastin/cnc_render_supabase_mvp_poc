# Supabase Worker Log PoC

This repo contains a proof of concept for streaming dummy worker logs into a hosted
Supabase database and controlling those workers from a static web dashboard.

## What is included
- Supabase migrations for `script_logs` and `worker_status` (with realtime + RLS)
- Render-friendly worker service that inserts logs and updates status
- SvelteKit static dashboard for auth, worker control, and live logs

## Architecture
- **Supabase (hosted)** stores logs and worker status rows.
- **Render web service** simulates long-running workers and writes to Supabase.
- **GitHub Pages** hosts the static dashboard (SvelteKit adapter-static).

## Supabase hosted setup
1. Create a new Supabase project.
2. Run the SQL in `supabase/migrations/20250101000000_create_script_logs.sql` and
   `supabase/migrations/20250101000001_add_worker_status.sql` in the SQL editor.
3. Enable Email + Password auth in Auth settings.
4. Set **Site URL** and **Additional Redirect URLs** to your GitHub Pages URL.

Supabase Studio is available at:
`https://supabase.com/dashboard/project/<project-ref>`

## Render worker setup (free tier)
1. Create a new **Web Service** on Render from `services/worker`.
2. Set the start command to `npm start`.
3. Set the build command to `npm install` (Playwright downloads Chromium on postinstall).
4. Add environment variables (see `services/worker/.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WORKER_NAMES` (ex: `lister1,scanner1,scanner2`)
   - `ALLOWED_ORIGINS` (your GitHub Pages URL + local dev URL)
   - `ALLOWED_EMAILS` (optional allowlist for control access)
   - `LOG_INTERVAL_MS` and `HEARTBEAT_INTERVAL_MS` (optional)
   - `PLAYWRIGHT_WORKERS`, `SCANNER_TARGET_URL`, `SCAN_INTERVAL_MS`
     (for the Playwright-backed scanner worker, ex: `https://books.toscrape.com/`)
   - `PLAYWRIGHT_BROWSERS_PATH=0` (store browsers inside the deploy artifact)

Render free services sleep when idle; the first start request may take a few
seconds to wake.

## GitHub Pages dashboard setup
1. Copy `apps/log-viewer/.env.example` to your local environment.
2. Set the values:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
   - `PUBLIC_WORKER_API_URL` (Render service URL)
   - `PUBLIC_WORKER_NAMES` (same list used by the worker service)
   - `BASE_PATH` (set to `/repo-name` for GitHub Pages)
3. Build the static site:

```bash
cd apps/log-viewer
npm install
BASE_PATH=/repo-name \
PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co \
PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
PUBLIC_WORKER_API_URL=https://your-render-service.onrender.com \
PUBLIC_WORKER_NAMES=lister1,scanner1,scanner2 \
npm run build
```

4. Deploy the generated `apps/log-viewer/build` folder to GitHub Pages.

## Local development (optional)
- Run the worker service locally:

```bash
cd services/worker
cp .env.example .env
npm install
npm start
```

- Run the dashboard locally:

```bash
cd apps/log-viewer
cp .env.example .env.local
npm install
npm run dev
```

## Notes
- Keep the service role key server-side only (Render env vars).
- The dashboard requires a signed-in Supabase user to read logs or control workers.
- Add or remove workers by updating `WORKER_NAMES` (Render) and
  `PUBLIC_WORKER_NAMES` (dashboard).
