#!/usr/bin/env bash
set -e

LOG_DIR=$(dirname "$LOG_FILE")
mkdir -p "$LOG_DIR"

# If the log file doesn't exist or is empty, generate a synthetic one for demo.
# Only when the directory is writable: the real deployment mounts the host log
# directory read-only, and a live log that is momentarily empty (rotated, or
# truncated by whatever writes it) must not turn into a crash loop here. The app
# tails the file, so it picks the data up as soon as it reappears.
if [ ! -s "$LOG_FILE" ]; then
  if [ -w "$LOG_DIR" ]; then
    echo "► Log file ${LOG_FILE} not found or empty — generating demo log (5 000 lines)…"
    python /app/tests/generate_test_log.py "$LOG_FILE" 5000
  else
    echo "► Log file ${LOG_FILE} is empty and ${LOG_DIR} is read-only — starting anyway, waiting for data."
  fi
fi

echo "► Starting Apache Live Logs on port ${PORT}…"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
