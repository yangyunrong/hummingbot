#!/usr/bin/env bash
set -euo pipefail

: "${DKIVN_ALLOW_DB_OUTAGE_TEST:?Set DKIVN_ALLOW_DB_OUTAGE_TEST=YES only in an approved VNext test/canary environment}"
if [[ "${DKIVN_ALLOW_DB_OUTAGE_TEST}" != "YES" ]]; then
  echo "refusing database outage test" >&2
  exit 2
fi

ENGINE_SERVICE="${DKIVN_ENGINE_SERVICE:-dkivn-engine.service}"
POSTGRES_SERVICE="${DKIVN_POSTGRES_SERVICE:-postgresql.service}"
API_URL="${DKIVN_CONTROL_API_URL:-http://127.0.0.1:8081}"
OUTAGE_SECONDS="${DKIVN_DB_OUTAGE_SECONDS:-10}"
MAX_RSS_GROWTH_KB="${DKIVN_MAX_RSS_GROWTH_KB:-65536}"

engine_pid_before="$(systemctl show -p MainPID --value "$ENGINE_SERVICE")"
[[ "$engine_pid_before" =~ ^[1-9][0-9]*$ ]] || { echo "engine not running" >&2; exit 1; }
rss_before="$(awk '/VmRSS:/ {print $2}' "/proc/$engine_pid_before/status")"

restore_db() {
  systemctl start "$POSTGRES_SERVICE" >/dev/null 2>&1 || true
}
trap restore_db EXIT

systemctl stop "$POSTGRES_SERVICE"
sleep "$OUTAGE_SECONDS"

engine_pid_after="$(systemctl show -p MainPID --value "$ENGINE_SERVICE")"
[[ "$engine_pid_before" == "$engine_pid_after" ]] || {
  echo "FAIL: engine restarted during PostgreSQL outage" >&2
  exit 1
}

rss_after="$(awk '/VmRSS:/ {print $2}' "/proc/$engine_pid_after/status")"
growth=$((rss_after - rss_before))
(( growth <= MAX_RSS_GROWTH_KB )) || {
  echo "FAIL: engine RSS grew by ${growth}KB during bounded outage window" >&2
  exit 1
}

status="$(curl -sS -o /tmp/dkivn-pg-outage-response.json -w '%{http_code}' -X POST "$API_URL/api/configs/drafts" -H 'content-type: application/json' -d '{}' || true)"
if [[ "$status" =~ ^2 ]]; then
  echo "FAIL: control-plane write unexpectedly succeeded while PostgreSQL was unavailable" >&2
  exit 1
fi

restore_db
trap - EXIT
sleep 2
curl -fsS "$API_URL/api/runtime/venues" >/dev/null

echo "PASS: engine survived PostgreSQL outage; control writes failed closed; RSS growth=${growth}KB"
