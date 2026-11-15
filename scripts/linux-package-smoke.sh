#!/usr/bin/env bash
set -euo pipefail
binary=$1
screenshot=$2
export GDK_BACKEND=x11
export LIBGL_ALWAYS_SOFTWARE=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
"$binary" > "$screenshot.log" 2>&1 &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' EXIT
window_id=""
for attempt in $(seq 1 40); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat "$screenshot.log"
    echo 'Application exited before showing a window.' >&2
    exit 1
  fi
  window_id=$(xdotool search --onlyvisible --name 'Eureka42' 2>/dev/null | head -n 1 || true)
  if [ -n "$window_id" ]; then break; fi
  sleep 0.5
done
if [ -z "$window_id" ]; then cat "$screenshot.log"; echo 'No Eureka42 window found.' >&2; exit 1; fi
# Allow the application to finish its splash and first-run rendering.
sleep 9
kill -0 "$app_pid"
xdotool getwindowname "$window_id"
scrot "$screenshot"
