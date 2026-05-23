#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/viktor138irk/sellway.git}"
APP_DIR="${APP_DIR:-/var/www/sellway.pro}"
DOMAIN="${DOMAIN:-sellway.pro}"
FRONTEND_URL="${FRONTEND_URL:-https://${DOMAIN}}"
API_PORT="${API_PORT:-3001}"
INIT_DB="${INIT_DB:-true}"
FASTPANEL_SAFE="${FASTPANEL_SAFE:-true}"
INSTALL_NGINX="${INSTALL_NGINX:-false}"
SITE_ROOT="${SITE_ROOT:-${APP_DIR}/sellway-frontend/dist}"
GENERATED_NGINX_DIR="${GENERATED_NGINX_DIR:-${APP_DIR}/deploy}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'HELP'
SellWay installer

Environment variables:
  APP_DIR=/var/www/sellway.pro
  DOMAIN=sellway.pro
  DATABASE_URL=postgresql://user:password@localhost:5432/db
  FRONTEND_URL=https://sellway.pro
  API_PORT=3001
  INIT_DB=true
  FASTPANEL_SAFE=true
  INSTALL_NGINX=false
  SITE_ROOT=/var/www/sellway.pro/sellway-frontend/dist

Example:
  sudo DOMAIN=sellway.pro DATABASE_URL='postgresql://sellway_user:pass@localhost:5432/sellway_db' bash scripts/install.sh
HELP
  exit 0
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/install.sh"
  exit 1
fi

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

ask() {
  local var_name="$1"
  local label="$2"
  local default_value="$3"
  local current_value="${!var_name:-}"

  if [[ -n "${current_value}" ]]; then
    return
  fi

  if [[ -t 0 ]]; then
    read -r -p "${label} [${default_value}]: " current_value
    printf -v "$var_name" '%s' "${current_value:-$default_value}"
  else
    printf -v "$var_name" '%s' "$default_value"
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"

  if [[ -f "$file" ]]; then
    grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2-
  fi
}

secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 48
  else
    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  fi
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\/&]/\\&/g')"

  if grep -qE "^${key}=" "$file"; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

version_major() {
  local version
  version="$(node -v 2>/dev/null || true)"
  version="${version#v}"
  printf '%s' "${version%%.*}"
}

install_system_packages() {
  log "Installing system packages"
  if command -v apt-get >/dev/null 2>&1; then
    local packages=(ca-certificates curl git postgresql-client openssl build-essential)
    if [[ "$INSTALL_NGINX" == "true" && "$FASTPANEL_SAFE" != "true" ]]; then
      packages+=(nginx)
    fi
    apt-get update
    apt-get install -y "${packages[@]}"
  else
    warn "apt-get not found. Install git, PostgreSQL client, curl and build tools manually."
  fi
}

install_node() {
  local major
  major="$(version_major)"
  if [[ -n "$major" && "$major" -ge 20 ]]; then
    log "Node.js $(node -v) already installed"
    return
  fi

  log "Installing Node.js 20"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    fail "Node.js 20+ is required. Install it manually and rerun this script."
  fi
}

prepare_code() {
  log "Preparing project in ${APP_DIR}"
  mkdir -p "$APP_DIR"

  if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" pull --ff-only
  elif [[ -d "$PWD/sellway-backend" && -d "$PWD/sellway-frontend" ]]; then
    cp -a "$PWD"/. "$APP_DIR"/
  elif [[ -z "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
    git clone "$REPO_URL" "$APP_DIR"
  elif [[ -d "$APP_DIR/sellway-backend" && -d "$APP_DIR/sellway-frontend" ]]; then
    warn "${APP_DIR} already contains SellWay files; using existing files."
  else
    fail "${APP_DIR} is not empty and does not look like a SellWay checkout."
  fi
}

write_backend_env() {
  local env_file="${APP_DIR}/sellway-backend/.env"
  local example_file="${APP_DIR}/sellway-backend/.env.example"

  if [[ ! -f "$env_file" ]]; then
    cp "$example_file" "$env_file"
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    DATABASE_URL="$(read_env_value "$env_file" DATABASE_URL)"
  fi

  ask DATABASE_URL "PostgreSQL DATABASE_URL" "postgresql://sellway_user:password@localhost:5432/sellway_db"

  set_env_value "$env_file" PORT "$API_PORT"
  set_env_value "$env_file" NODE_ENV "production"
  set_env_value "$env_file" FRONTEND_URL "$FRONTEND_URL"
  set_env_value "$env_file" DATABASE_URL "$DATABASE_URL"
  set_env_value "$env_file" UPLOAD_URL "${FRONTEND_URL}/uploads"

  if grep -q 'your_very_long_random_secret_key_min_64_chars' "$env_file"; then
    set_env_value "$env_file" JWT_SECRET "$(secret)"
  fi
  if grep -q 'another_very_long_random_secret_key_min_64_chars' "$env_file"; then
    set_env_value "$env_file" JWT_REFRESH_SECRET "$(secret)"
  fi

  chmod 600 "$env_file"
}

install_backend() {
  log "Installing backend"
  cd "${APP_DIR}/sellway-backend"
  mkdir -p logs uploads
  npm install

  if [[ "$INIT_DB" == "true" && "$DATABASE_URL" != *"password@localhost"* ]]; then
    log "Applying database schema"
    if ! psql "$DATABASE_URL" -f db/schema.sql; then
      warn "Database schema was not applied because PostgreSQL is unavailable or DATABASE_URL is wrong."
      warn "Fix DATABASE_URL in ${APP_DIR}/sellway-backend/.env and run: psql \"\$DATABASE_URL\" -f ${APP_DIR}/sellway-backend/db/schema.sql"
    fi
  else
    warn "Database schema was not applied. Set DATABASE_URL and run: psql \"\$DATABASE_URL\" -f ${APP_DIR}/sellway-backend/db/schema.sql"
  fi
}

install_frontend() {
  log "Installing frontend"
  cd "${APP_DIR}/sellway-frontend"
  cat > .env.production <<EOF
VITE_API_URL=/api
VITE_WS_URL=${FRONTEND_URL/http/ws}
EOF
  npm install
  npm run build

  if [[ "$SITE_ROOT" != "${APP_DIR}/sellway-frontend/dist" ]]; then
    log "Copying frontend build to SITE_ROOT=${SITE_ROOT}"
    mkdir -p "$SITE_ROOT"
    cp -a "${APP_DIR}/sellway-frontend/dist"/. "$SITE_ROOT"/
  fi
}

install_pm2() {
  log "Starting PM2 services"
  npm install -g pm2
  cd "${APP_DIR}/sellway-backend"
  pm2 start ecosystem.config.js --env production || pm2 restart ecosystem.config.js --env production
  pm2 save
}

generate_nginx_config() {
  log "Generating Nginx config"
  mkdir -p "$GENERATED_NGINX_DIR"
  local nginx_file="${GENERATED_NGINX_DIR}/nginx-${DOMAIN}.conf"
  local cert_dir="/etc/letsencrypt/live/${DOMAIN}"

  if [[ -f "${cert_dir}/fullchain.pem" && -f "${cert_dir}/privkey.pem" ]]; then
    cat > "$nginx_file" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate ${cert_dir}/fullchain.pem;
    ssl_certificate_key ${cert_dir}/privkey.pem;

    root ${SITE_ROOT};
    index index.html;
    client_max_body_size 10M;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        alias ${APP_DIR}/sellway-backend/uploads/;
        add_header X-Content-Type-Options nosniff;
    }

    location /health {
        proxy_pass http://127.0.0.1:${API_PORT};
        access_log off;
    }
}
EOF
  else
    cat > "$nginx_file" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${SITE_ROOT};
    index index.html;
    client_max_body_size 10M;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        alias ${APP_DIR}/sellway-backend/uploads/;
        add_header X-Content-Type-Options nosniff;
    }

    location /health {
        proxy_pass http://127.0.0.1:${API_PORT};
        access_log off;
    }
}
EOF
    warn "SSL certificate not found. Enable HTTPS in FastPanel/Certbot after DNS points to this server."
  fi

  echo "$nginx_file"
}

apply_nginx_config() {
  local generated_file="$1"

  if [[ "$INSTALL_NGINX" != "true" ]]; then
    warn "FastPanel-safe mode: Nginx was not changed. Copy config from ${generated_file} into FastPanel if needed."
    return
  fi

  if [[ "$FASTPANEL_SAFE" == "true" ]]; then
    warn "FASTPANEL_SAFE=true blocks direct Nginx changes. Set FASTPANEL_SAFE=false INSTALL_NGINX=true only if you manage Nginx outside FastPanel."
    return
  fi

  log "Applying Nginx config"
  local nginx_file="/etc/nginx/sites-available/${DOMAIN}"
  local enabled_file="/etc/nginx/sites-enabled/${DOMAIN}"
  cp "$generated_file" "$nginx_file"
  ln -sfn "$nginx_file" "$enabled_file"
  nginx -t
  systemctl reload nginx || service nginx reload || true
}

finish_message() {
  cat <<EOF

SellWay installation finished.

Project: ${APP_DIR}
Site root: ${SITE_ROOT}
Backend env: ${APP_DIR}/sellway-backend/.env
Generated Nginx config: ${GENERATED_NGINX_DIR}/nginx-${DOMAIN}.conf
PM2: pm2 status
Health: curl http://127.0.0.1:${API_PORT}/health
Site: ${FRONTEND_URL}

If you changed .env after install:
  pm2 restart sellway-api sellway-bot --update-env
EOF
}

install_system_packages
install_node
prepare_code
write_backend_env
install_backend
install_frontend
install_pm2
generated_nginx_config="$(generate_nginx_config | tail -n 1)"
apply_nginx_config "$generated_nginx_config"
finish_message
