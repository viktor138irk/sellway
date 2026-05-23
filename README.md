# SellWay

SellWay — маркетплейс цифровых товаров с React-фронтендом, Express API, PostgreSQL, Telegram-ботом, WebSocket-чатом заказов и интеграцией платежей ЮKassa.

## Структура

- `sellway-frontend/` — React + Vite.
- `sellway-backend/` — Node.js + Express + PostgreSQL + Telegram bot.
- `scripts/install.sh` — автоматическая установка на Linux-сервер.
- `INSTALL.md` — подробная инструкция по установке и обновлению.

## Быстрый старт на сервере

```bash
sudo apt-get update
sudo apt-get install -y git
sudo git clone https://github.com/viktor138irk/sellway.git /var/www/sellway.pro
cd /var/www/sellway.pro
sudo bash scripts/install.sh
```

Установщик работает как пошаговый мастер: спросит домен, корневую директорию сайта в FastPanel, настройки PostgreSQL, опционально Telegram/SMTP/ЮKassa, затем покажет сводку и начнёт установку.

Он поставит системные зависимости, Node.js 20, npm-пакеты, PM2, соберёт фронтенд, создаст `.env`, применит SQL-схему при твоём подтверждении и подготовит Nginx-конфиг.

По умолчанию включён безопасный режим для FastPanel: установщик не меняет `/etc/nginx`, не трогает `sites-enabled` и не перезагружает Nginx. Готовый конфиг будет создан в `deploy/nginx-<domain>.conf`, его можно вставить в FastPanel вручную.

Если корневая директория сайта отличается от директории проекта, укажи её через `SITE_ROOT`:

```bash
sudo DOMAIN=sellway.pro \
SITE_ROOT=/var/www/www-root/data/www/sellway.pro \
DATABASE_URL='postgresql://sellway_user:password@localhost:5432/sellway_db' \
bash scripts/install.sh
```

Подробности: [INSTALL.md](INSTALL.md).

## Обновление

После первой установки можно обновляться одной командой:

```bash
cd /var/www/sellway.pro
sudo bash scripts/update.sh
```

Скрипт подтянет код из GitHub, сохранит старый `.env`, соберёт frontend, скопирует его в сохранённый `SITE_ROOT` FastPanel и перезапустит PM2.

## Локальный запуск

Backend:

```bash
cd sellway-backend
cp .env.example .env
npm install
npm run dev
```

Frontend:

```bash
cd sellway-frontend
npm install
npm run dev
```

По умолчанию Vite запускается на `http://localhost:5173`, API — на `http://localhost:3001`.
