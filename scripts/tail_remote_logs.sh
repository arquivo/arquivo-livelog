#!/usr/bin/env bash
# Merges Apache access logs from several arquivo.pt servers into one local file
# for consumption by arquivo-livelog (point LOG_FILE at the merged output).
#
# Usage:
#   ./scripts/tail_remote_logs.sh --server host1,host2,... [--out /path/to/merged.log]
#
# Remote log files are named logfile.<ISO-8601-date> and rotate at midnight,
# so the ssh tails are killed and respawned against the new date each day.

set -euo pipefail

REMOTE_LOG_DIR="${REMOTE_LOG_DIR:-/var/log/arquivo/httpd}"
OUT_FILE="${OUT_FILE:-/tmp/test_merged.log}"
HOSTS=()

usage() {
    echo "Usage: $0 --server host1,host2,... [--out /path/to/merged.log]" >&2
    exit 1
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --server)
            [ "$#" -ge 2 ] || usage
            IFS=',' read -ra raw_hosts <<< "$2"
            for h in "${raw_hosts[@]}"; do
                h="${h// /}"
                [ -n "$h" ] && HOSTS+=("$h")
            done
            shift 2
            ;;
        --out)
            [ "$#" -ge 2 ] || usage
            OUT_FILE="$2"
            shift 2
            ;;
        *)
            usage
            ;;
    esac
done

[ "${#HOSTS[@]}" -eq 0 ] && usage

pids=()

cleanup() {
    [ "${#pids[@]}" -eq 0 ] && return
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
    pids=()
}
trap cleanup EXIT INT TERM

start_tails() {
    for host in "${HOSTS[@]}"; do
        ssh -C "${host}" "tail -f ${REMOTE_LOG_DIR}/logfile.\$(date --iso-8601)" >> "$OUT_FILE" &
        pids+=("$!")
    done
}

seconds_until_midnight() {
    local now next_midnight
    now=$(date +%s)
    next_midnight=$(date -d 'tomorrow 00:00:00' +%s)
    echo $((next_midnight - now))
}

: > "$OUT_FILE"
echo "Tailing ${HOSTS[*]} into ${OUT_FILE} (Ctrl-C to stop)"

while true; do
    start_tails
    sleep "$(seconds_until_midnight)"
    cleanup
done
