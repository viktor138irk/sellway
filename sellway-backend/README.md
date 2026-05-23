# SellWay Backend — Руководство по деплою

## Стек
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Database**: PostgreSQL 15+
- **Process manager**: PM2
- **Web server**: Nginx (FastPanel)
- **Telegram**: node-telegram-bot-api + SOCKS5

---

## 1. Подготовка сервера (FastPanel)

### PostgreSQL
```
FastPanel → Базы данных → Создать
Имя: sellway_db
Пользователь: sellway_user
Пароль: (сгенерировать)
```

### Node.js
```
FastPanel → Node.js → Включить
Версия: 20.x (LTS)
```

---

## 2. Загрузка кода

```bash
# На сервере
cd /var/www/sellway.pro
mkdir backend && cd backend

# Загружаем через SFTP или git
git clone https://github.com/yourname/sellway-backend.git .
# или загружаем через файловый менеджер FastPanel
```

---

## 3. Настройка окружения

```bash
cp .env.example .env
nano .env   # заполни все переменные
```

Обязательно заполни:
- `DATABASE_URL` — строка подключения к БД из FastPanel
- `JWT_SECRET` — длинная случайная строка (min 64 символа)
- `JWT_REFRESH_SECRET` — другая длинная случайная строка
- `TELEGRAM_BOT_TOKEN` — токен от @BotFather
- `TELEGRAM_ADMIN_CHAT_ID` — ID чата для уведомлений админа

Для SOCKS5 прокси (если нужен):
- `PROXY_ENABLED=true`
- `PROXY_HOST=ip.прокси.сервера`
- `PROXY_PORT=1080`
- `PROXY_USERNAME=user` (если есть)
- `PROXY_PASSWORD=pass` (если есть)

---

## 4. Установка зависимостей и БД

```bash
npm install

# Инициализация схемы БД
psql $DATABASE_URL -f db/schema.sql

# Проверка
psql $DATABASE_URL -c "\dt"
```

---

## 5. Запуск через PM2

```bash
# Установка PM2 глобально
npm install -g pm2

# Запуск API + бота
NODE_ENV=production pm2 start ecosystem.config.js --env production

# Сохранить для автозапуска
pm2 save
pm2 startup   # следуй инструкции в выводе

# Мониторинг
pm2 status
pm2 logs sellway-api
pm2 logs sellway-bot
pm2 monit
```

---

## 6. Nginx (FastPanel)

```
FastPanel → Сайты → sellway.pro → Конфигурация Nginx
```

Скопируй содержимое `nginx.conf` в конфиг сайта.

Или вручную:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/sellway.pro
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. SSL (Let's Encrypt)

FastPanel выдаёт сертификат автоматически при создании сайта.
Если нет — в панели: Сайты → sellway.pro → SSL → Let's Encrypt

---

## 8. Frontend

```bash
cd /var/www/sellway.pro/frontend

# Установка + сборка
npm install
VITE_API_URL=https://sellway.pro/api npm run build

# dist/ автоматически подхватится Nginx
```

---

## 9. Telegram бот — получить Chat ID

1. Отправь боту `/start`
2. Зайди: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Найди `"chat": {"id": XXXXXXX}` — это и есть `TELEGRAM_ADMIN_CHAT_ID`

---

## 10. Привязка Telegram к аккаунту

На странице настроек sellway.pro → Telegram → Получить ссылку привязки.
Бот поддерживает команды:
- `/start TOKEN` — привязка аккаунта
- `/balance` — баланс
- `/orders` — последние заказы
- `/stop` — отключить уведомления

---

## API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| POST | /api/auth/register | Регистрация |
| POST | /api/auth/login | Вход |
| POST | /api/auth/refresh | Обновить токен |
| POST | /api/auth/logout | Выход |
| GET  | /api/auth/me | Текущий пользователь |
| GET  | /api/products | Список товаров |
| GET  | /api/products/:id | Товар |
| POST | /api/products | Создать товар (продавец) |
| POST | /api/products/:id/images | Загрузить фото |
| POST | /api/products/:id/keys | Добавить ключи |
| POST | /api/orders | Создать заказ |
| GET  | /api/orders | Мои заказы |
| GET  | /api/orders/:id | Детали заказа |
| POST | /api/orders/:id/confirm | Подтвердить получение |
| POST | /api/orders/:id/dispute | Открыть спор |
| POST | /api/orders/:id/message | Сообщение в чат |
| GET  | /api/admin/stats | Статистика (admin) |
| GET  | /api/admin/users | Пользователи (admin) |
| GET  | /api/admin/disputes | Споры (admin) |
| POST | /api/admin/disputes/:id/resolve | Решить спор |

---

## Мониторинг

```bash
pm2 status          # статус процессов
pm2 logs            # все логи
tail -f logs/error.log   # ошибки
tail -f logs/combined.log # все события
```

---

## ⚠️ Миграция для существующих установок (v1.0 → v1.1)

Если БД уже инициализирована старой версией схемы:

```bash
psql $DATABASE_URL -f db/migrations/001_fix_audit.sql
pm2 restart sellway-api sellway-bot
```

См. `BUGS_FOUND.md` для деталей о фиксах.
