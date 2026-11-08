#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl sqlite3

if ! command -v node >/dev/null 2>&1 || [[ "$(node --version)" != v24.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup_24.sh
  bash /tmp/nodesource_setup_24.sh
  apt-get install -y nodejs
  rm -f /tmp/nodesource_setup_24.sh
fi

node --version
npm --version
sqlite3 --version

if ! id attendance >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/attendance-api --shell /usr/sbin/nologin attendance
fi

install -d -o root -g root -m 0755 /opt/attendance-api
install -d -o attendance -g attendance -m 0750 /var/lib/attendance-api
install -d -o attendance -g attendance -m 0750 /var/lib/attendance-api/uploads
install -o root -g root -m 0644 ./server.js /opt/attendance-api/server.js
install -o root -g root -m 0644 ./package.json /opt/attendance-api/package.json

cd /opt/attendance-api
npm install --omit=dev --no-audit --no-fund

cat >/etc/systemd/system/attendance-api.service <<'UNIT'
[Unit]
Description=Attendance API (Node.js + SQLite)
After=network.target

[Service]
Type=simple
User=attendance
Group=attendance
WorkingDirectory=/opt/attendance-api
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=ATTENDANCE_DATA_DIR=/var/lib/attendance-api
Environment=ATTENDANCE_DB_PATH=/var/lib/attendance-api/attendance.db
Environment=ATTENDANCE_UPLOADS_DIR=/var/lib/attendance-api/uploads
ExecStart=/usr/bin/node /opt/attendance-api/server.js
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/attendance-api

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now attendance-api
curl --fail --silent --show-error http://127.0.0.1:3000/healthz