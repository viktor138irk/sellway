ALTER TYPE delivery_type ADD VALUE IF NOT EXISTS 'file';

CREATE TABLE IF NOT EXISTS product_files (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         VARCHAR(500) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  mime_type   VARCHAR(120),
  size_bytes  BIGINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_files_product ON product_files(product_id);

INSERT INTO settings (key, value, description) VALUES
  ('withdraw_method_card_enabled', 'true', 'Включить вывод на банковскую карту'),
  ('withdraw_method_card_commission', '0.02', 'Комиссия вывода на карту'),
  ('withdraw_method_sbp_enabled', 'true', 'Включить вывод через СБП'),
  ('withdraw_method_sbp_commission', '0.01', 'Комиссия вывода через СБП'),
  ('withdraw_method_paypal_enabled', 'true', 'Включить вывод PayPal'),
  ('withdraw_method_paypal_commission', '0.02', 'Комиссия вывода PayPal'),
  ('withdraw_method_crypto_enabled', 'true', 'Включить вывод криптовалюты'),
  ('withdraw_method_crypto_commission', '0.01', 'Комиссия вывода криптовалюты')
ON CONFLICT (key) DO NOTHING;
