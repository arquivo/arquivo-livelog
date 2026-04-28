#!/usr/bin/env bash
set -e

LOG_DIR=$(dirname "$LOG_FILE")
mkdir -p "$LOG_DIR"

# If the log file doesn't exist or is empty, generate a synthetic one for demo
if [ ! -s "$LOG_FILE" ]; then
  echo "► Log file ${LOG_FILE} not found or empty — generating demo log (5 000 lines)…"
  python /app/tests/generate_test_log.py "$LOG_FILE" 5000
fi

echo "► Starting Apache Live Logs on port ${PORT}…"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
