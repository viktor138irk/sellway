# SellWay v4.1

SellWay — маркетплейс цифровых товаров и услуг с балансом, безопасной сделкой, seller/admin зонами, Telegram-ботом, YooKassa, PostgreSQL, Node.js API и React frontend.

## Быстрая установка на чистый сервер

```bash
apt update && apt install -y git
cd /opt
git clone https://github.com/viktor138irk/sellway.git
cd sellway
sudo bash install.sh sellway.pro admin@sellway.pro
```

После установки выпустите SSL:

```bash
certbot --nginx -d sellway.pro -d www.sellway.pro
```

Проверка:

```bash
curl http://sellway.pro/health
curl http://sellway.pro/api/categories
systemctl status sellway-api --no-pager
systemctl status sellway-bot --no-pager
```

Подробная инструкция: [`INSTALL_CLEAN_SERVER.md`](INSTALL_CLEAN_SERVER.md).

## Структура

```text
sellway-backend/     Node.js/Express API, PostgreSQL, Telegram bot, WebSocket
sellway-frontend/    React/Vite frontend
install.sh           автоустановка под чистый Ubuntu/Debian сервер
```

## Версия

Текущая версия: `v4.1-clean-server`.

Исправлено относительно v4:

- frontend build;
- API категорий;
- профиль пользователя;
- смена пароля;
- загрузка изображений категорий;
- `users.meta` для Telegram-привязки;
- WebSocket `/ws/orders/:id`;
- установщик без FastPanel.
