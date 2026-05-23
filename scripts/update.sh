#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CONFIG_FILE="${CONFIG_FILE:-${APP_DIR}/deploy/install.env}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"

log() {
  printf '\n\033[1;32m==> %s\033[0m\n' "$*" >&2
}

warn() {
  printf '\n\033[1;33mWARN: %s\033[0m\n' "$*" >&2
}

read_kv() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2-
}

read_env_value() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2-
}

infer_site_root() {
  if [[ -n "${SITE_ROOT:-}" ]]; then
    printf '%s' "$SITE_ROOT"
    return
  fi

  local domain="${DOMAIN:-sellway.pro}"
  local matches=()
  while IFS= read -r -d '' dir; do
    matches+=("$dir")
  done < <(find /var/www -path "*/data/www/${domain}" -type d -print0 2>/dev/null || true)

  if [[ "${#matches[@]}" -eq 1 ]]; then
    printf '%s' "${matches[0]}"
  else
    printf '%s' "${APP_DIR}/sellway-frontend/dist"
  fi
}

load_config() {
  DOMAIN="${DOMAIN:-$(read_kv "$CONFIG_FILE" DOMAIN)}"
  FRONTEND_URL="${FRONTEND_URL:-$(read_kv "$CONFIG_FILE" FRONTEND_URL)}"
  API_PORT="${API_PORT:-$(read_kv "$CONFIG_FILE" API_PORT)}"
  SITE_ROOT="${SITE_ROOT:-$(read_kv "$CONFIG_FILE" SITE_ROOT)}"

  DOMAIN="${DOMAIN:-sellway.pro}"
  FRONTEND_URL="${FRONTEND_URL:-$(read_env_value "${APP_DIR}/sellway-backend/.env" FRONTEND_URL)}"
  API_PORT="${API_PORT:-$(read_env_value "${APP_DIR}/sellway-backend/.env" PORT)}"
  FRONTEND_URL="${FRONTEND_URL:-https://${DOMAIN}}"
  API_PORT="${API_PORT:-3001}"
  SITE_ROOT="$(infer_site_root)"
}

save_config() {
  mkdir -p "${APP_DIR}/deploy"
  cat > "$CONFIG_FILE" <<EOF
APP_DIR=${APP_DIR}
DOMAIN=${DOMAIN}
FRONTEND_URL=${FRONTEND_URL}
API_PORT=${API_PORT}
SITE_ROOT=${SITE_ROOT}
FASTPANEL_SAFE=true
INSTALL_NGINX=false
EOF
}

run_migrations() {
  local env_file="${APP_DIR}/sellway-backend/.env"
  local database_url
  database_url="$(read_env_value "$env_file" DATABASE_URL)"

  if [[ "$RUN_MIGRATIONS" != "true" || -z "$database_url" || "$database_url" == *"password@localhost"* ]]; then
    warn "Migrations skipped."
    return
  fi

  shopt -s nullglob
  local migrations=("${APP_DIR}"/sellway-backend/db/migrations/*.sql)
  shopt -u nullglob

  if [[ "${#migrations[@]}" -eq 0 ]]; then
    return
  fi

  log "Applying database migrations"
  for migration in "${migrations[@]}"; do
    psql "$database_url" -v ON_ERROR_STOP=1 -f "$migration"
  done
}

update_code() {
  log "Pulling latest code"
  cd "$APP_DIR"
  git pull --ff-only
}

update_backend() {
  log "Updating backend dependencies"
  cd "${APP_DIR}/sellway-backend"
  npm install
  mkdir -p logs uploads
}

update_frontend() {
  log "Building frontend"
  cd "${APP_DIR}/sellway-frontend"
  cat > .env.production <<EOF
VITE_API_URL=/api
VITE_WS_URL=${FRONTEND_URL/http/ws}
EOF
  npm install
  npm run build

  if [[ "$SITE_ROOT" != "${APP_DIR}/sellway-frontend/dist" ]]; then
    log "Copying frontend build to ${SITE_ROOT}"
    mkdir -p "$SITE_ROOT"
    cp -a "${APP_DIR}/sellway-frontend/dist"/. "$SITE_ROOT"/
  fi
}

restart_services() {
  log "Restarting PM2 services"
  cd "${APP_DIR}/sellway-backend"
  if pm2 describe sellway-api >/dev/null 2>&1; then
    pm2 restart sellway-api --update-env
  else
    pm2 start ecosystem.config.js --env production --only sellway-api
  fi

  if pm2 describe sellway-bot >/dev/null 2>&1; then
    pm2 restart sellway-bot --update-env
  else
    pm2 start ecosystem.config.js --env production --only sellway-bot
  fi
  pm2 save
}

finish() {
  cat <<EOF

SellWay update finished.

Project: ${APP_DIR}
Site root: ${SITE_ROOT}
Config: ${CONFIG_FILE}
Health: curl http://127.0.0.1:${API_PORT}/health
EOF
}

load_config
save_config
update_code
update_backend
run_migrations
update_frontend
restart_services
finish
