#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/sellway.pro}"
ENV_FILE="$APP_DIR/sellway-backend/.env"

mask() {
  local value="${1:-}"
  if [ -z "$value" ]; then
    echo "<empty>"
  else
    echo "${value:0:6}...${value: -4}"
  fi
}

read_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

echo "==> Telegram env"
echo "TELEGRAM_BOT_TOKEN=$(mask "$(read_env TELEGRAM_BOT_TOKEN)")"
echo "TELEGRAM_BOT_USERNAME=$(read_env TELEGRAM_BOT_USERNAME)"
echo "TELEGRAM_ADMIN_BOT_TOKEN=$(mask "$(read_env TELEGRAM_ADMIN_BOT_TOKEN)")"
echo "TELEGRAM_ADMIN_BOT_USERNAME=$(read_env TELEGRAM_ADMIN_BOT_USERNAME)"
echo "TELEGRAM_ADMIN_CHAT_ID=$(read_env TELEGRAM_ADMIN_CHAT_ID)"
echo

echo "==> PM2 status"
pm2 status sellway-bot sellway-admin-bot || true
echo

echo "==> Telegram API via SOCKS5"
node "$APP_DIR/scripts/check-telegram-proxy.js" || true
echo

echo "==> User bot logs"
pm2 logs sellway-bot --lines 80 --nostream || true
echo

echo "==> Admin bot logs"
pm2 logs sellway-admin-bot --lines 80 --nostream || true
