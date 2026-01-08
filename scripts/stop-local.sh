# @file stop-local.sh
# @description Stop running log writer, Vite dev server, and Supabase.
# @role Cleanup script for the local PoC runtime stack.
#
# @pseudocode
#  1. Read stored pid files for running processes.
#  2. Stop the Vite dev server if present.
#  3. Stop the log writer if present.
#  4. Remove pid files.
#  5. Stop the local Supabase stack.

set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
log_dir="$root_dir/logs"

if [ -f "$log_dir/vite.pid" ]; then
  kill "$(cat "$log_dir/vite.pid")" 2>/dev/null || true
  rm -f "$log_dir/vite.pid"
fi

if [ -f "$log_dir/log-writer.pid" ]; then
  kill "$(cat "$log_dir/log-writer.pid")" 2>/dev/null || true
  rm -f "$log_dir/log-writer.pid"
fi

supabase stop --project-id local-log-viewer || true

echo "Stopped local PoC services."
