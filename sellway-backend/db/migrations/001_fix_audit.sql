-- ═══════════════════════════════════════════════════
--  SellWay Migration v1.0 → v1.1
--  Fixes critical bugs found in audit
-- ═══════════════════════════════════════════════════

-- 1. Добавляем колонку для Telegram-привязки (вместо несуществующего users.meta)
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_expires TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_tg_token ON users(telegram_link_token) WHERE telegram_link_token IS NOT NULL;

-- 2. На случай если кто-то уже накатил v1.0 — гарантируем чистоту
-- (никаких изменений в данных)

-- Готово. Применяется командой:
--   psql $DATABASE_URL -f db/migrations/001_fix_audit.sql
