#!/usr/bin/env bash
set -euo pipefail

: "${DKIVN_ALLOW_SHADOW_RESTART_TEST:?Set DKIVN_ALLOW_SHADOW_RESTART_TEST=YES to restart only the read-only Toobit shadow lane}"
if [[ "${DKIVN_ALLOW_SHADOW_RESTART_TEST}" != "YES" ]]; then
  echo "refusing shadow-lane restart test" >&2
  exit 2
fi

TOOBIT_SHADOW_SERVICE="${DKIVN_TOOBIT_SHADOW_SERVICE:-dkivn-v14-toobit-shadow.service}"
BITGET_SHADOW_SERVICE="${DKIVN_BITGET_SHADOW_SERVICE:-dkivn-v14-bitget-shadow.service}"

bitget_pid_before="$(systemctl show -p MainPID --value "$BITGET_SHADOW_SERVICE")"
toobit_pid_before="$(systemctl show -p MainPID --value "$TOOBIT_SHADOW_SERVICE")"

[[ "$bitget_pid_before" =~ ^[1-9][0-9]*$ ]] || { echo "Bitget shadow not running" >&2; exit 1; }
[[ "$toobit_pid_before" =~ ^[1-9][0-9]*$ ]] || { echo "Toobit shadow not running" >&2; exit 1; }

systemctl restart "$TOOBIT_SHADOW_SERVICE"
sleep 2

bitget_pid_after="$(systemctl show -p MainPID --value "$BITGET_SHADOW_SERVICE")"
toobit_pid_after="$(systemctl show -p MainPID --value "$TOOBIT_SHADOW_SERVICE")"

[[ "$bitget_pid_before" == "$bitget_pid_after" ]] || {
  echo "FAIL: Bitget shadow PID changed when Toobit shadow restarted" >&2
  exit 1
}
[[ "$toobit_pid_before" != "$toobit_pid_after" ]] || {
  echo "FAIL: Toobit shadow restart did not produce a new PID" >&2
  exit 1
}

echo "PASS: Toobit shadow restart remained isolated from Bitget shadow"
