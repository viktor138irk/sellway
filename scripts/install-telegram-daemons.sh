#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/sellway.pro}"
BACKEND_DIR="$APP_DIR/sellway-backend"

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

cd "$BACKEND_DIR"
mkdir -p logs

pm2 start ecosystem.config.js --env production --only sellway-bot
pm2 start ecosystem.config.js --env production --only sellway-admin-bot
pm2 save

if [ "$(id -u)" = "0" ]; then
  pm2 startup systemd -u root --hp /root || true
else
  pm2 startup systemd -u "$(whoami)" --hp "$HOME" || true
fi

echo
echo "Telegram daemons are configured:"
echo "  pm2 status sellway-bot sellway-admin-bot"
echo "  pm2 logs sellway-bot"
echo "  pm2 logs sellway-admin-bot"
