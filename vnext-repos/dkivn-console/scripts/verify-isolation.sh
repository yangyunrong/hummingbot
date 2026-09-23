#!/usr/bin/env bash
set -euo pipefail

: "${DKIVN_ALLOW_RESTART_TEST:?Set DKIVN_ALLOW_RESTART_TEST=YES to run the console restart isolation test}"
if [[ "${DKIVN_ALLOW_RESTART_TEST}" != "YES" ]]; then
  echo "refusing restart test: DKIVN_ALLOW_RESTART_TEST must equal YES" >&2
  exit 2
fi

ENGINE_SERVICE="${DKIVN_ENGINE_SERVICE:-dkivn-engine.service}"
CONSOLE_SERVICE="${DKIVN_CONSOLE_SERVICE:-dkivn-console.service}"
API_URL="${DKIVN_CONTROL_API_URL:-http://127.0.0.1:8081}"

engine_pid_before="$(systemctl show -p MainPID --value "$ENGINE_SERVICE")"
[[ "$engine_pid_before" =~ ^[1-9][0-9]*$ ]] || { echo "engine not running" >&2; exit 1; }

before_json="$(mktemp)"
after_json="$(mktemp)"
trap 'rm -f "$before_json" "$after_json"' EXIT

curl -fsS "$API_URL/api/runtime/venues" > "$before_json"
before_source="$(node -e 'const f=require("fs");const x=JSON.parse(f.readFileSync(process.argv[1],"utf8"));console.log(x.map(v=>v.sourceAt||"").sort().join("|"))' "$before_json")"

systemctl restart "$CONSOLE_SERVICE"
sleep 3

engine_pid_after="$(systemctl show -p MainPID --value "$ENGINE_SERVICE")"
[[ "$engine_pid_before" == "$engine_pid_after" ]] || {
  echo "FAIL: engine PID changed during console restart: $engine_pid_before -> $engine_pid_after" >&2
  exit 1
}

curl -fsS "$API_URL/api/runtime/venues" > "$after_json"
after_source="$(node -e 'const f=require("fs");const x=JSON.parse(f.readFileSync(process.argv[1],"utf8"));console.log(x.map(v=>v.sourceAt||"").sort().join("|"))' "$after_json")"

[[ -n "$before_source" && -n "$after_source" ]] || {
  echo "FAIL: runtime telemetry missing before/after console restart" >&2
  exit 1
}

echo "PASS: console restart left engine PID unchanged ($engine_pid_after)"
echo "runtime source before=$before_source"
echo "runtime source after=$after_source"
