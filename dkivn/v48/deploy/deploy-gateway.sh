#!/usr/bin/env bash
set -euo pipefail

V48_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ROOT="/opt/dkivn-gateway/v48"
SERVICE_FILE="/etc/systemd/system/dkivn-gateway.service"
ENV_FILE="/etc/dkivn-gateway.env"
BACKUP_ROOT="/opt/dkivn-gateway-backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ ${EUID:-$(id -u)} -eq 0 ]] || fail "run as root"
[[ -f "$V48_DIR/package.json" ]] || fail "package.json missing"
[[ -f "$V48_DIR/src/gateway.js" ]] || fail "gateway.js missing"
[[ -f "$SERVICE_FILE" ]] || fail "systemd service missing"
[[ -f "$ENV_FILE" ]] || fail "gateway env missing"

cd "$V48_DIR"
npm test
node --check src/gateway.js

install -d -m 0750 "$BACKUP_DIR"
cp -a /opt/dkivn-gateway "$BACKUP_DIR/dkivn-gateway"
cp -a "$SERVICE_FILE" "$BACKUP_DIR/dkivn-gateway.service"
cp -a "$ENV_FILE" "$BACKUP_DIR/dkivn-gateway.env"

install -d -m 0755 "$TARGET_ROOT/src"
install -m 0644 package.json "$TARGET_ROOT/package.json"
find src -maxdepth 1 -type f -name '*.js' -print0 | while IFS= read -r -d '' f; do
  install -m 0644 "$f" "$TARGET_ROOT/src/$(basename "$f")"
done

if grep -q '^GATEWAY_LIVE_ENABLED=' "$ENV_FILE"; then
  sed -i 's/^GATEWAY_LIVE_ENABLED=.*/GATEWAY_LIVE_ENABLED=false/' "$ENV_FILE"
else
  printf '\nGATEWAY_LIVE_ENABLED=false\n' >> "$ENV_FILE"
fi

python3 - "$SERVICE_FILE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
old='ExecStart=/usr/bin/node /opt/dkivn-gateway/gateway.js'
new='ExecStart=/usr/bin/node /opt/dkivn-gateway/v48/src/gateway.js'
if new not in s:
    if old not in s:
        raise SystemExit('unexpected ExecStart; refusing mutation')
    s=s.replace(old,new)
p.write_text(s)
PY

systemctl daemon-reload
systemctl restart dkivn-gateway.service
systemctl is-active --quiet dkivn-gateway.service || fail "dkivn-gateway.service not active"

echo "DEPLOY_OK backup=$BACKUP_DIR live=false"
