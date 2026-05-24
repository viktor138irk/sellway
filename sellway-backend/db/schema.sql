-- ═══════════════════════════════════════════════════
--  SellWay Database Schema
--  sellway.pro
-- ═══════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUMS ────────────────────────────────────────────

CREATE TYPE user_role      AS ENUM ('buyer', 'seller', 'admin', 'moderator');
CREATE TYPE user_status    AS ENUM ('active', 'banned', 'pending_verify');
CREATE TYPE order_status   AS ENUM ('pending', 'paid', 'delivering', 'delivered', 'confirmed', 'disputed', 'cancelled', 'refunded');
CREATE TYPE delivery_type  AS ENUM ('auto', 'manual', 'file');
CREATE TYPE product_status AS ENUM ('draft', 'pending', 'active', 'rejected', 'archived');
CREATE TYPE withdraw_status AS ENUM ('pending', 'processing', 'completed', 'rejected');
CREATE TYPE withdraw_method AS ENUM ('card', 'paypal', 'crypto', 'sbp');
CREATE TYPE dispute_status AS ENUM ('open', 'reviewing', 'resolved_buyer', 'resolved_seller', 'closed');
CREATE TYPE notif_type     AS ENUM (
  'order_new', 'order_paid', 'order_delivered', 'order_confirmed', 'order_cancelled', 'order_disputed',
  'withdraw_approved', 'withdraw_rejected', 'balance_credit',
  'review_new', 'key_delivered', 'system'
);
CREATE TYPE transaction_type AS ENUM ('credit', 'debit', 'hold', 'release', 'refund', 'commission');

-- ── USERS ────────────────────────────────────────────

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             VARCHAR(255) UNIQUE NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  username          VARCHAR(50)  UNIQUE NOT NULL,
  role              user_role    NOT NULL DEFAULT 'buyer',
  status            user_status  NOT NULL DEFAULT 'pending_verify',
  avatar_url        VARCHAR(500),
  phone             VARCHAR(20),
  phone_verified    BOOLEAN DEFAULT FALSE,
  buyer_rating      DECIMAL(3,2) DEFAULT 0.00,
  buyer_reviews_count INT DEFAULT 0,
  phone_verify_code_hash VARCHAR(255),
  phone_verify_expires TIMESTAMPTZ,
  email_verified    BOOLEAN DEFAULT FALSE,
  email_verify_token VARCHAR(255),
  reset_token       VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  two_fa_enabled    BOOLEAN DEFAULT FALSE,
  two_fa_secret     VARCHAR(255),
  telegram_link_token VARCHAR(255),
  telegram_link_expires TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  last_login_ip     INET,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_tg_token ON users(telegram_link_token) WHERE telegram_link_token IS NOT NULL;

-- ── SELLERS (расширение профиля) ─────────────────────

CREATE TABLE sellers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name      VARCHAR(100),
  description       TEXT,
  verified          BOOLEAN DEFAULT FALSE,
  verified_at       TIMESTAMPTZ,
  rating            DECIMAL(3,2) DEFAULT 0.00,
  total_reviews     INT DEFAULT 0,
  total_sales       INT DEFAULT 0,
  auto_rate         DECIMAL(5,2) DEFAULT 98.00,
  custom_commission_rate DECIMAL(6,4),
  referral_code     VARCHAR(32) UNIQUE DEFAULT UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', '') FROM 1 FOR 10)),
  referred_by_seller_id UUID REFERENCES users(id),
  referral_commission_rate DECIMAL(6,4) DEFAULT 0.0100,
  referral_earnings DECIMAL(12,2) DEFAULT 0.00,
  referred_sellers_count INT DEFAULT 0,
  auto_payout_enabled BOOLEAN DEFAULT FALSE,
  auto_payout_method withdraw_method DEFAULT 'card',
  auto_payout_threshold DECIMAL(12,2) DEFAULT 500,
  auto_payout_requisites JSONB DEFAULT '{}'::jsonb,
  response_time_min INT DEFAULT 0,
  is_online         BOOLEAN DEFAULT FALSE,
  last_seen_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ── WALLETS ──────────────────────────────────────────

CREATE TABLE wallets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance     DECIMAL(12,2) DEFAULT 0.00,
  held        DECIMAL(12,2) DEFAULT 0.00,
  total_in    DECIMAL(12,2) DEFAULT 0.00,
  total_out   DECIMAL(12,2) DEFAULT 0.00,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ── TRANSACTIONS ─────────────────────────────────────

CREATE TABLE transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id),
  order_id    UUID,
  type        transaction_type NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  balance_before DECIMAL(12,2),
  balance_after  DECIMAL(12,2),
  description TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CATEGORIES ───────────────────────────────────────

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_type VARCHAR(20) NOT NULL DEFAULT 'product' CHECK (category_type IN ('product', 'service')),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) NOT NULL,
  image_url   VARCHAR(500),
  emoji       VARCHAR(10) DEFAULT '🎮',
  description TEXT,
  parent_id   UUID REFERENCES categories(id),
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INT DEFAULT 0,
  product_count INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_type, slug)
);

-- ── PRODUCTS ─────────────────────────────────────────

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id       UUID NOT NULL REFERENCES users(id),
  category_id     UUID REFERENCES categories(id),
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  short_desc      VARCHAR(500),
  price           DECIMAL(12,2) NOT NULL,
  old_price       DECIMAL(12,2),
  delivery_type   delivery_type NOT NULL DEFAULT 'auto',
  status          product_status NOT NULL DEFAULT 'pending',
  guarantee_days  INT DEFAULT 0,
  tags            TEXT[] DEFAULT '{}',
  views_count     INT DEFAULT 0,
  sales_count     INT DEFAULT 0,
  rating          DECIMAL(3,2) DEFAULT 0.00,
  reviews_count   INT DEFAULT 0,
  keys_count      INT DEFAULT 0,
  is_featured     BOOLEAN DEFAULT FALSE,
  meta            JSONB DEFAULT '{}',
  moderated_by    UUID REFERENCES users(id),
  moderated_at    TIMESTAMPTZ,
  reject_reason   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRODUCT IMAGES ────────────────────────────────────

CREATE TABLE product_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         VARCHAR(500) NOT NULL,
  sort_order  INT DEFAULT 0,
  is_main     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRODUCT KEYS (цифровые товары) ───────────────────

CREATE TABLE product_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key_value   TEXT NOT NULL,
  is_sold     BOOLEAN DEFAULT FALSE,
  sold_at     TIMESTAMPTZ,
  order_id    UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_files (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         VARCHAR(500) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  mime_type   VARCHAR(120),
  size_bytes  BIGINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ORDERS ───────────────────────────────────────────

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number    VARCHAR(30) UNIQUE NOT NULL,
  buyer_id        UUID NOT NULL REFERENCES users(id),
  seller_id       UUID NOT NULL REFERENCES users(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  key_id          UUID REFERENCES product_keys(id),
  status          order_status NOT NULL DEFAULT 'pending',
  quantity        INT NOT NULL DEFAULT 1,
  amount          DECIMAL(12,2) NOT NULL,
  commission      DECIMAL(12,2) NOT NULL DEFAULT 0,
  seller_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
  delivery_type   delivery_type NOT NULL,
  auto_confirm_at TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── ORDER MESSAGES (Escrow чат) ───────────────────────

CREATE TABLE order_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  message     TEXT NOT NULL,
  is_system   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── DISPUTES ─────────────────────────────────────────

CREATE TABLE disputes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID NOT NULL REFERENCES orders(id),
  opener_id     UUID NOT NULL REFERENCES users(id),
  reason        TEXT NOT NULL,
  status        dispute_status NOT NULL DEFAULT 'open',
  admin_id      UUID REFERENCES users(id),
  resolution    TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dispute_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id  UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  message     TEXT NOT NULL,
  is_admin    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── REVIEWS ──────────────────────────────────────────

CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  buyer_id    UUID NOT NULL REFERENCES users(id),
  seller_id   UUID NOT NULL REFERENCES users(id),
  product_id  UUID NOT NULL REFERENCES products(id),
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  is_auto     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE TABLE buyer_reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  seller_id   UUID NOT NULL REFERENCES users(id),
  buyer_id    UUID NOT NULL REFERENCES users(id),
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id)
);

-- ── WITHDRAWALS ──────────────────────────────────────

CREATE TABLE withdrawal_requests (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id),
  amount      DECIMAL(12,2) NOT NULL,
  commission  DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_amount  DECIMAL(12,2) NOT NULL,
  method      withdraw_method NOT NULL,
  requisites  JSONB NOT NULL DEFAULT '{}',
  status      withdraw_status NOT NULL DEFAULT 'pending',
  admin_id    UUID REFERENCES users(id),
  admin_note  TEXT,
  processed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOTIFICATIONS ─────────────────────────────────────

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notif_type NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  link        VARCHAR(500),
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── TELEGRAM USERS ────────────────────────────────────

CREATE TABLE telegram_users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id   BIGINT UNIQUE NOT NULL,
  username      VARCHAR(100),
  notifications_enabled BOOLEAN DEFAULT TRUE,
  linked_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ── REFRESH TOKENS ────────────────────────────────────

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(500) UNIQUE NOT NULL,
  ip          INET,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PROMO CODES ───────────────────────────────────────

CREATE TABLE promo_codes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(50) UNIQUE NOT NULL,
  discount_pct  DECIMAL(5,2),
  discount_fixed DECIMAL(12,2),
  max_uses      INT,
  used_count    INT DEFAULT 0,
  expires_at    TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── SETTINGS ─────────────────────────────────────────

CREATE TABLE settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── AUDIT LOGS ────────────────────────────────────────

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  entity      VARCHAR(100),
  entity_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip          INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
--  INDEXES
-- ═══════════════════════════════════════════════════

CREATE INDEX idx_products_seller     ON products(seller_id);
CREATE INDEX idx_products_category   ON products(category_id);
CREATE INDEX idx_products_status     ON products(status);
CREATE INDEX idx_orders_buyer        ON orders(buyer_id);
CREATE INDEX idx_orders_seller       ON orders(seller_id);
CREATE INDEX idx_orders_status       ON orders(status);
CREATE INDEX idx_orders_created      ON orders(created_at DESC);
CREATE INDEX idx_transactions_user   ON transactions(user_id);
CREATE INDEX idx_notifications_user  ON notifications(user_id, is_read);
CREATE INDEX idx_reviews_seller      ON reviews(seller_id);
CREATE INDEX idx_reviews_product     ON reviews(product_id);
CREATE INDEX idx_buyer_reviews_buyer ON buyer_reviews(buyer_id);
CREATE INDEX idx_buyer_reviews_seller ON buyer_reviews(seller_id);
CREATE INDEX idx_sellers_referral_code ON sellers(referral_code);
CREATE INDEX idx_sellers_referred_by ON sellers(referred_by_seller_id);
CREATE INDEX idx_keys_product        ON product_keys(product_id, is_sold);
CREATE INDEX idx_product_files_product ON product_files(product_id);
CREATE INDEX idx_refresh_token       ON refresh_tokens(token);
CREATE INDEX idx_order_messages      ON order_messages(order_id);
CREATE INDEX idx_audit_logs_user     ON audit_logs(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════
--  FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════

-- Автообновление updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated   BEFORE UPDATE ON orders   FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Обновление счётчика ключей в товаре
CREATE OR REPLACE FUNCTION update_keys_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products SET keys_count = (
    SELECT COUNT(*) FROM product_keys WHERE product_id = COALESCE(NEW.product_id, OLD.product_id) AND NOT is_sold
  ) WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_keys_count AFTER INSERT OR UPDATE OR DELETE ON product_keys
FOR EACH ROW EXECUTE FUNCTION update_keys_count();

-- Обновление рейтинга продавца
CREATE OR REPLACE FUNCTION update_seller_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sellers SET
    rating = (SELECT COALESCE(AVG(rating),0) FROM reviews WHERE seller_id = NEW.seller_id),
    total_reviews = (SELECT COUNT(*) FROM reviews WHERE seller_id = NEW.seller_id)
  WHERE user_id = NEW.seller_id;
  UPDATE products SET
    rating = (SELECT COALESCE(AVG(rating),0) FROM reviews WHERE product_id = NEW.product_id),
    reviews_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id)
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_seller_rating AFTER INSERT OR UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_seller_rating();

CREATE OR REPLACE FUNCTION update_buyer_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET
    buyer_rating = (SELECT COALESCE(AVG(rating),0) FROM buyer_reviews WHERE buyer_id = NEW.buyer_id),
    buyer_reviews_count = (SELECT COUNT(*) FROM buyer_reviews WHERE buyer_id = NEW.buyer_id)
  WHERE id = NEW.buyer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_buyer_rating AFTER INSERT OR UPDATE ON buyer_reviews
FOR EACH ROW EXECUTE FUNCTION update_buyer_rating();

-- Генерация номера заказа
CREATE SEQUENCE order_seq START 10000;
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number = 'SW-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('order_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_order_number BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- ═══════════════════════════════════════════════════
--  SEED DATA
-- ═══════════════════════════════════════════════════

INSERT INTO categories (name, slug, emoji, sort_order) VALUES
  ('Steam',          'steam',     '🎮', 1),
  ('Roblox',         'roblox',    '🧱', 2),
  ('Minecraft',      'minecraft', '⛏️', 3),
  ('Fortnite',       'fortnite',  '🔫', 4),
  ('Genshin Impact', 'genshin',   '⚔️', 5),
  ('CS2',            'cs2',       '💣', 6),
  ('Valorant',       'valorant',  '🎯', 7),
  ('Аккаунты',       'accounts',  '👤', 8),
  ('Подписки',       'subs',      '📦', 9);

INSERT INTO settings (key, value, description) VALUES
  ('platform_commission',       '0.07',  'Комиссия платформы (доля)'),
  ('default_seller_commission_rate', '0.07', 'Комиссия платформы для продавцов без персональной ставки'),
  ('default_referral_commission_rate', '0.01', 'Вознаграждение рефереру с оборота приглашенного продавца'),
  ('min_withdrawal',            '500',   'Минимальная сумма вывода'),
  ('max_withdrawal_daily',      '100000','Максимальная сумма вывода в день'),
  ('withdrawal_commission',     '0.02',  'Комиссия при выводе'),
  ('withdraw_method_card_enabled', 'true', 'Включить вывод на банковскую карту'),
  ('withdraw_method_card_commission', '0.02', 'Комиссия вывода на карту'),
  ('withdraw_method_sbp_enabled', 'true', 'Включить вывод через СБП'),
  ('withdraw_method_sbp_commission', '0.01', 'Комиссия вывода через СБП'),
  ('withdraw_method_paypal_enabled', 'true', 'Включить вывод PayPal'),
  ('withdraw_method_paypal_commission', '0.02', 'Комиссия вывода PayPal'),
  ('withdraw_method_crypto_enabled', 'true', 'Включить вывод криптовалюты'),
  ('withdraw_method_crypto_commission', '0', 'Комиссия вывода криптовалюты'),
  ('auto_payouts_enabled', 'true', 'Глобальное включение автовыплат продавцов'),
  ('auto_payout_min_balance', '500', 'Минимальный баланс для автовыплаты'),
  ('auto_payout_interval_hours', '24', 'Интервал проверки автовыплат'),
  ('usdt_rub_rate_fallback', '90', 'Резервный курс USDT/RUB'),
  ('escrow_auto_confirm_hours', '48',    'Часов до автоподтверждения'),
  ('auto_review_rating',        '5',     'Оценка при автоотзыве'),
  ('maintenance_mode',          'false', 'Режим обслуживания'),
  ('new_seller_requires_verify','true',  'Верификация для продавцов'),
  ('terms_title', 'Правила SellWay', 'Заголовок правил площадки'),
  ('terms_version', '1.0', 'Версия правил площадки'),
  ('terms_content', '', 'Текст правил площадки'),
  ('sms_code_template', 'Ваш код подтверждения {{code}}', 'Шаблон SMS-кода подтверждения');
