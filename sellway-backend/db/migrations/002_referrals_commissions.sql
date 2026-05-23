-- SellWay Migration v1.2
-- Seller referral program and per-seller commission rates

ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS custom_commission_rate DECIMAL(6,4),
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32),
  ADD COLUMN IF NOT EXISTS referred_by_seller_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS referral_commission_rate DECIMAL(6,4) DEFAULT 0.0100,
  ADD COLUMN IF NOT EXISTS referral_earnings DECIMAL(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS referred_sellers_count INT DEFAULT 0;

UPDATE sellers
SET referral_code = UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', '') FROM 1 FOR 10))
WHERE referral_code IS NULL OR referral_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_referral_code ON sellers(referral_code);
CREATE INDEX IF NOT EXISTS idx_sellers_referred_by ON sellers(referred_by_seller_id);

UPDATE sellers s
SET referred_sellers_count=(
  SELECT COUNT(*) FROM sellers child WHERE child.referred_by_seller_id=s.user_id
);

INSERT INTO settings (key, value, description) VALUES
  ('default_referral_commission_rate', '0.01', 'Вознаграждение рефереру с оборота приглашенного продавца'),
  ('default_seller_commission_rate', '0.07', 'Комиссия платформы для продавцов без персональной ставки')
ON CONFLICT (key) DO NOTHING;
