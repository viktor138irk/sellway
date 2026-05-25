#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CONFIG_FILE="${CONFIG_FILE:-${APP_DIR}/deploy/install.env}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
HEALTH_CHECK="${HEALTH_CHECK:-true}"

log() {
  printf '\n\033[1;32m==> %s\033[0m\n' "$*" >&2
}

warn() {
  printf '\n\033[1;33mWARN: %s\033[0m\n' "$*" >&2
}

fail() {
  printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2
  exit 1
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

validate_fastpanel_target() {
  log "Checking FastPanel deploy target"

  [[ -d "${APP_DIR}/sellway-backend" ]] || fail "Backend directory not found: ${APP_DIR}/sellway-backend"
  [[ -d "${APP_DIR}/sellway-frontend" ]] || fail "Frontend directory not found: ${APP_DIR}/sellway-frontend"

  if [[ -z "$SITE_ROOT" ]]; then
    fail "SITE_ROOT is empty. Set it in ${CONFIG_FILE} or pass SITE_ROOT=/path/to/site."
  fi

  mkdir -p "$SITE_ROOT"

  if [[ ! -w "$SITE_ROOT" ]]; then
    warn "SITE_ROOT is not writable by current user: ${SITE_ROOT}"
    warn "Run update as root/sudo or fix permissions in FastPanel."
  fi

  cat <<EOF
FastPanel-safe update mode:
  APP_DIR: ${APP_DIR}
  DOMAIN: ${DOMAIN}
  FRONTEND_URL: ${FRONTEND_URL}
  API_PORT: ${API_PORT}
  SITE_ROOT: ${SITE_ROOT}
  Nginx/SSL: not touched
EOF
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
    log "Copying frontend build to FastPanel SITE_ROOT=${SITE_ROOT}"
    mkdir -p "$SITE_ROOT"
    cp -a "${APP_DIR}/sellway-frontend/dist"/. "$SITE_ROOT"/
  fi

  local built_index="${APP_DIR}/sellway-frontend/dist/index.html"
  local published_index="${SITE_ROOT}/index.html"
  local built_bundle
  local published_bundle
  [[ -f "$published_index" ]] || fail "Frontend index was not published to SITE_ROOT: ${published_index}"
  built_bundle="$(grep -oE '/assets/index-[^"]+\.js' "$built_index" | head -n 1 || true)"
  published_bundle="$(grep -oE '/assets/index-[^"]+\.js' "$published_index" | head -n 1 || true)"
  [[ -n "$built_bundle" ]] || fail "Built frontend bundle cannot be identified in ${built_index}"
  [[ "$built_bundle" == "$published_bundle" ]] || fail "SITE_ROOT still contains an old frontend build. Built ${built_bundle}, published ${published_bundle:-missing}."
  printf 'Frontend published bundle: %s\n' "$published_bundle"
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
  if pm2 describe sellway-admin-bot >/dev/null 2>&1; then
    pm2 restart sellway-admin-bot --update-env
  else
    pm2 start ecosystem.config.js --env production --only sellway-admin-bot
  fi
  pm2 save
}

post_update_healthcheck() {
  [[ "$HEALTH_CHECK" == "true" ]] || return

  log "Checking SellWay API health"
  sleep 2

  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/tmp/sellway-health.json 2>/tmp/sellway-health.err; then
    printf 'Health: OK — '
    cat /tmp/sellway-health.json
    printf '\n'
    return
  fi

  warn "SellWay API health-check failed. Last curl error:"
  cat /tmp/sellway-health.err || true
  warn "PM2 status:"
  pm2 status || true
  warn "Recent API logs:"
  pm2 logs sellway-api --lines 80 --nostream || true
  fail "Update finished but API is not healthy. Check .env, database and PM2 logs."
}

check_public_frontend() {
  local expected_index="${SITE_ROOT}/index.html"
  local expected_bundle
  local public_bundle
  local public_html="/tmp/sellway-public-index.html"
  local check_url="${FRONTEND_URL%/}/?deploy_check=$(date +%s)"

  log "Checking published frontend on public domain"
  expected_bundle="$(grep -oE '/assets/index-[^"]+\.js' "$expected_index" | head -n 1 || true)"
  if ! curl -fsS -H 'Cache-Control: no-cache' "$check_url" -o "$public_html"; then
    fail "Cannot request public frontend at ${FRONTEND_URL}"
  fi
  public_bundle="$(grep -oE '/assets/index-[^"]+\.js' "$public_html" | head -n 1 || true)"
  [[ "$expected_bundle" == "$public_bundle" ]] || fail "FastPanel serves a different frontend build. SITE_ROOT has ${expected_bundle:-missing}, public site has ${public_bundle:-missing}. Check SITE_ROOT/document root."
  printf 'Public frontend bundle: OK - %s\n' "$public_bundle"
}

publish_sitemap() {
  local api_sitemap="http://127.0.0.1:${API_PORT}/api/seo/sitemap.xml"
  local target="${SITE_ROOT}/sitemap.xml"
  local tmp="/tmp/sellway-sitemap.xml"

  log "Publishing product sitemap in FastPanel site root"
  if curl -fsS "$api_sitemap" -o "$tmp"; then
    cp "$tmp" "$target"
    printf 'Sitemap: %s\n' "${FRONTEND_URL%/}/sitemap.xml"
  else
    warn "Cannot generate product sitemap from ${api_sitemap}; the fallback static sitemap remains published."
  fi
}

check_public_sitemap() {
  local public_sitemap="${FRONTEND_URL%/}/sitemap.xml"

  log "Checking public sitemap for search engines"
  if curl -fsS "$public_sitemap" >/tmp/sellway-sitemap-public.xml 2>/tmp/sellway-sitemap.err &&
     grep -q '<urlset' /tmp/sellway-sitemap-public.xml; then
    printf 'Public sitemap: OK - %s\n' "$public_sitemap"
    return
  fi

  warn "Public sitemap is unavailable or invalid: ${public_sitemap}"
  warn "Google and Yandex will not discover all product URLs until this URL returns XML with HTTP 200."
}

finish() {
  cat <<EOF

SellWay update finished.

Project: ${APP_DIR}
Site root: ${SITE_ROOT}
Config: ${CONFIG_FILE}
Health: curl http://127.0.0.1:${API_PORT}/health
FastPanel: Nginx and SSL were not changed.
EOF
}

load_config
validate_fastpanel_target
save_config
update_code
update_backend
run_migrations
update_frontend
restart_services
post_update_healthcheck
check_public_frontend
publish_sitemap
check_public_sitemap
finish
