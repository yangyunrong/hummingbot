#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/dkivn-gateway.env"
SERVICE="dkivn-gateway.service"
[[ -f "$ENV_FILE" ]] || { echo 'ENV_FILE_MISSING' >&2; exit 1; }
systemctl is-active --quiet "$SERVICE" || { echo 'SERVICE_NOT_ACTIVE' >&2; exit 1; }

BRIDGE_URL="$(sed -n 's/^DKIVN_BRIDGE_URL=//p' "$ENV_FILE" | tail -1)"
TOKEN="$(sed -n 's/^DKIVN_GATEWAY_TOKEN=//p' "$ENV_FILE" | tail -1)"
LIVE="$(sed -n 's/^GATEWAY_LIVE_ENABLED=//p' "$ENV_FILE" | tail -1)"
[[ -n "$BRIDGE_URL" && -n "$TOKEN" ]] || { echo 'BRIDGE_ENV_MISSING' >&2; exit 1; }
[[ "$LIVE" == "false" ]] || { echo 'LIVE_NOT_DISABLED' >&2; exit 1; }
STATE_URL="${BRIDGE_URL%/dkivn-v47-gateway-telemetry}/dkivn-v48-state-read"

call_bridge(){
  curl -fsS --max-time 8 -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' "$BRIDGE_URL$1"
}
call_state(){
  curl -fsS --max-time 8 -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' "$STATE_URL$1"
}

HEALTH="$(call_bridge /health)"
ACCOUNT="$(call_bridge /account-snapshot)"
ORDERS="$(call_bridge /maker/open-orders)"
RUNTIME="$(call_state /runtime)"
TELEMETRY="$(call_state /telemetry)"

python3 - "$HEALTH" "$ACCOUNT" "$ORDERS" "$RUNTIME" "$TELEMETRY" <<'PY'
import json,sys,time,datetime
h,a,o,r,t=map(json.loads,sys.argv[1:])
assert h.get('ok') is True and h.get('strategy')=='V48_ADAPTIVE_MAKER', h
assert a.get('ok') is True, a
assert o.get('ok') is True and len(o.get('orders') or [])==0, o
assert r.get('ok') is True, r
runtime=r.get('runtime') or {}
assert runtime.get('state')=='DISARMED', runtime
assert t.get('ok') is True, t
tele=t.get('telemetry') or {}
assert tele.get('public_ws_connected') is True, tele
assert tele.get('private_ws_connected') is True, tele
hb=tele.get('heartbeat_at')
assert hb, tele
stamp=datetime.datetime.fromisoformat(str(hb).replace('Z','+00:00')).timestamp()
assert time.time()-stamp < 15, {'heartbeat_at':hb}
print('VERIFY_OK state=DISARMED public_ws=true private_ws=true open_v48_orders=0 live=false')
PY
