# @file start-local.sh
# @description Start local Supabase, install deps, and launch log + web servers.
# @role Orchestrate the PoC runtime stack for logs and the viewer UI.
#
# @pseudocode
#  1. Start the local Supabase stack.
#  2. Reset the database with local migrations.
#  3. Read Supabase status JSON for keys and URLs.
#  4. Write environment files for the log writer and web app.
#  5. Install Python dependencies for the log writer.
#  6. Install Node dependencies for the log viewer.
#  7. Start the log writer in the background.
#  8. Start the Vite dev server in the background.
#  9. Print the URLs to open in a browser.

set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
log_dir="$root_dir/logs"

mkdir -p "$log_dir"

cd "$root_dir"

supabase start
if ! supabase db reset --yes; then
  echo "Database reset failed; continuing with existing schema."
fi

python3 - <<'PY'
import json
import subprocess
from pathlib import Path

status_output = subprocess.check_output(["supabase", "status", "-o", "json"], text=True)
json_start = status_output.find("{")
if json_start == -1:
    raise RuntimeError("Supabase status JSON not found.")

data = json.loads(status_output[json_start:])

Path("apps/log-viewer/.env.local").write_text(
    f"PUBLIC_SUPABASE_URL={data['API_URL']}\n"
    f"PUBLIC_SUPABASE_ANON_KEY={data['ANON_KEY']}\n",
    encoding="utf-8",
)

Path("scripts/.env.local").write_text(
    f"SUPABASE_URL={data['API_URL']}\n"
    f"SUPABASE_SERVICE_ROLE_KEY={data['SERVICE_ROLE_KEY']}\n",
    encoding="utf-8",
)
PY

python3 -m pip install --user --break-system-packages -r scripts/requirements.txt

if [ ! -d "$root_dir/apps/log-viewer/node_modules" ]; then
  (cd "$root_dir/apps/log-viewer" && npm install)
fi

nohup bash -lc 'set -a; source scripts/.env.local; set +a; python3 scripts/log-writer.py --follow --interval 1' \
  > "$log_dir/log-writer.log" 2>&1 &

echo $! > "$log_dir/log-writer.pid"

nohup bash -lc 'set -a; source apps/log-viewer/.env.local; set +a; cd apps/log-viewer; npm run dev -- --host 0.0.0.0 --port 5173' \
  > "$log_dir/vite.log" 2>&1 &

echo $! > "$log_dir/vite.pid"

primary_ip=$(hostname -I | awk '{print $1}')
if [ -z "$primary_ip" ]; then
  primary_ip="127.0.0.1"
fi

cat <<EOF_MSG

Log writer running.
Vite dev server running.

Try one of these URLs:
- http://127.0.0.1:5173/
- http://localhost:5173/
- http://${primary_ip}:5173/

If none work, check logs in logs/.
EOF_MSG
