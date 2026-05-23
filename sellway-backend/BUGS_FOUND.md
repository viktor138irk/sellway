# 🐛 Аудит багов SellWay v4

## 🔴 P0 — Критичные (ломают функционал)

### 1. `users.meta` не существует в схеме
**Файлы:** `bot.js:150,169`, `routes/seller.js:54`
**Что ломается:** Привязка Telegram падает с SQL-ошибкой при первом же клике.
**Фикс:** Добавить колонку `telegram_link_token VARCHAR(255)` в `users`, переписать запросы.

### 2. Эндпоинт `PUT /api/profile` не существует
**Вызывается из:** `SettingsPage.jsx` (profile/) — кнопка «Сохранить профиль»
**Что ломается:** 404 при попытке изменить ник.
**Фикс:** Добавить роут `PUT /api/auth/profile`.

### 3. Эндпоинт `POST /api/auth/change-password` не существует
**Вызывается из:** `SettingsPage.jsx` (profile/) — форма смены пароля
**Фикс:** Добавить роут.

### 4. Эндпоинт `POST /api/admin/upload-image` не существует
**Вызывается из:** `admin/CategoriesPage.jsx` — загрузка фото категории
**Фикс:** Добавить универсальный аплоад в admin-роуты.

### 5. GET `/products` и `/products/:id` возвращают `images` в РАЗНЫХ форматах
**Что ломается:**
- `/products` → `["url1", "url2"]` (массив строк)
- `/products/:id` → `[{url, sort_order, is_main}]` (массив объектов)

`ProductPage` ожидает строки → отрисует `[object Object]` вместо фото.
**Фикс:** Привести оба к массиву URL-строк.

### 6. Продавец видит ВСЕ товары вместо своих
**Файл:** `seller/ProductsPage.jsx`
**Что:** Фронт передаёт `?seller=userId`, но backend в `GET /products` фильтр `seller_id` не поддерживает. Продавец видит ВЕСЬ каталог как «свои товары».
**Фикс:** Добавить фильтр `seller_id` в `GET /products` (только своим / админу).

### 7. SECURITY: `DELETE /products/:id/keys/:keyId` без проверки владельца
**Файл:** `routes/products.js`
**Что:** Любой залогиненный продавец может удалить чужие ключи зная UUID.
**Фикс:** Проверять `seller_id`.

### 8. После login `user.balance` всегда `undefined` → ломается покупка
**Файлы:** `AuthContext.jsx`, `ProductPage.jsx`
**Что:** Login возвращает `{id, email, username, role}` без `balance`. На странице товара `parseFloat(user.balance || 0) < product.price` → **всегда true** → постоянно открывается модалка пополнения, даже если денег хватает.
**Фикс:** В `AuthContext.login` после успешного логина дёрнуть `getMe()` для полных данных.

### 9. GET `/orders` игнорирует фильтр `status`
**Файл:** `routes/orders.js`
**Что:** `SellerOrdersPage` шлёт `?status=paid`, backend игнорирует — отдаёт все.
**Фикс:** Добавить фильтр в WHERE.

---

## 🟠 P1 — Важные

### 10. Аплоад фото не сбрасывает старый `is_main`
**Файл:** `routes/products.js:170-180`
**Что:** При повторной загрузке у товара будет несколько фото с `is_main=TRUE`.
**Фикс:** `UPDATE product_images SET is_main=FALSE WHERE product_id=$1` перед вставкой.

### 11. Комиссия вывода всегда 2%, не учитывает метод
**Файлы:** `seller.js:withdrawal`, `seller/WithdrawalPage.jsx`
**Что:** SBP/crypto = 1% по UI, но backend всегда считает 2%.
**Фикс:** Перенести расчёт комиссии на backend по методу.

### 12. WebSocket-сообщения через REST не транслируются
**Файл:** `routes/orders.js:/message`
**Что:** Сообщения сохраняются в БД, но другая сторона не видит их в чате до перезагрузки. WS-broadcast используется только когда сообщение пришло через WS.
**Фикс:** Экспортировать `broadcast` из `ws/server.js` и вызывать из REST.

### 13. `/auth/login` не возвращает `balance` — клиент видит 0
**Что:** То же что #8, но с другой стороны. `getMe()` в /auth/me возвращает балансы, но `/login` — нет.
**Фикс:** Сделать единую функцию `buildUserResponse(userId)`.

### 14. Bot `/start` ищет токен в неправильных полях
**Файл:** `telegram/bot.js:140-160`
**Что:** Ищет в `email_verify_token`, потом в `meta->>'telegram_link_token'`. Логика запутанная и работает «случайно».
**Фикс:** Использовать только новую колонку `telegram_link_token`.

### 15. `register` не сохраняет SOCKS5-доступ для бота
Мелочь, не баг.

---

## 🟡 P2 — Полировка

### 16. `seller.last_seen_at` не обновляется при активности
### 17. Notification polling каждые 30 сек — нагрузка на БД
### 18. `confirmed_at`, `paid_at` обновляются, но в чате не показываются как события
### 19. `logout` не ждёт ответа сервера перед navigate
### 20. `AdminUsers` — нет дебаунса для поиска

---

## Что фикшу прямо сейчас

P0 (1-9) + P1 (10-14). P2 — оставлю на следующий проход.
