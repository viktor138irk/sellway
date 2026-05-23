# Установка SellWay

Инструкция рассчитана на Ubuntu/Debian-сервер. Для FastPanel можно использовать те же шаги, а SSL и домен настроить через панель.

## 1. Подготовь базу данных

Создай PostgreSQL-базу и пользователя, например:

```text
database: sellway_db
user: sellway_user
password: strong_password
```

Строка подключения будет выглядеть так:

```text
postgresql://sellway_user:strong_password@localhost:5432/sellway_db
```

## 2. Запусти автоустановщик

Вариант с интерактивными вопросами:

```bash
sudo apt-get update
sudo apt-get install -y git
sudo git clone https://github.com/viktor138irk/sellway.git /var/www/sellway.pro
cd /var/www/sellway.pro
sudo bash scripts/install.sh
```

Вариант без вопросов:

```bash
sudo DOMAIN=sellway.pro \
APP_DIR=/var/www/sellway.pro \
SITE_ROOT=/var/www/sellway.pro/sellway-frontend/dist \
DATABASE_URL='postgresql://sellway_user:strong_password@localhost:5432/sellway_db' \
FRONTEND_URL='https://sellway.pro' \
bash scripts/install.sh
```

`APP_DIR` — директория проекта с backend/frontend.

`SITE_ROOT` — корневая директория сайта, которую FastPanel использует как document root. Если она отличается от `sellway-frontend/dist`, установщик скопирует туда собранный фронтенд без удаления существующих файлов.

## 3. Заполни секреты

Установщик создаёт файл:

```bash
/var/www/sellway.pro/sellway-backend/.env
```

Проверь и заполни реальные значения:

- `DATABASE_URL` — подключение к PostgreSQL.
- `JWT_SECRET` и `JWT_REFRESH_SECRET` — установщик генерирует автоматически.
- `TELEGRAM_BOT_TOKEN` — токен от `@BotFather`.
- `TELEGRAM_ADMIN_CHAT_ID` — ID чата администратора.
- `SMTP_*` — почта для уведомлений.
- `YUKASSA_SHOP_ID` и `YUKASSA_SECRET_KEY` — ключи ЮKassa.

После изменения `.env` перезапусти процессы:

```bash
pm2 restart sellway-api sellway-bot --update-env
```

## 4. Nginx и SSL

По умолчанию установщик работает в режиме `FASTPANEL_SAFE=true`:

- не пишет в `/etc/nginx`;
- не создаёт symlink в `/etc/nginx/sites-enabled`;
- не перезагружает Nginx;
- только создаёт готовый конфиг в `/var/www/sellway.pro/deploy/nginx-sellway.pro.conf`.

Это сделано, чтобы не поломать конфигурацию FastPanel.

В FastPanel открой сайт → конфигурация Nginx и вставь содержимое сгенерированного файла:

```bash
cat /var/www/sellway.pro/deploy/nginx-sellway.pro.conf
```

Если сертификат Let's Encrypt уже есть в `/etc/letsencrypt/live/<domain>/`, будет создан HTTPS-конфиг. Если сертификата ещё нет, будет создан HTTP-конфиг, который можно перевести на HTTPS через FastPanel или Certbot.

Для FastPanel можно вручную вставить конфиг из:

```bash
/var/www/sellway.pro/sellway-backend/nginx.conf
```

Если ты точно управляешь Nginx не через FastPanel и хочешь, чтобы установщик сам применил конфиг:

```bash
sudo FASTPANEL_SAFE=false INSTALL_NGINX=true bash scripts/install.sh
```

## 5. Проверка

```bash
pm2 status
curl http://127.0.0.1:3001/health
```

Открой сайт:

```text
https://sellway.pro
```

Если SSL ещё не включён:

```text
http://sellway.pro
```

## Обновление

```bash
cd /var/www/sellway.pro
sudo git pull
sudo bash scripts/install.sh
```

Установщик не затирает существующий `.env`, а только использует его для запуска.
