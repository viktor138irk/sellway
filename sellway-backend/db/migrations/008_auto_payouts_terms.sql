ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS auto_payout_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_payout_method withdraw_method DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS auto_payout_threshold DECIMAL(12,2) DEFAULT 500,
  ADD COLUMN IF NOT EXISTS auto_payout_requisites JSONB DEFAULT '{}'::jsonb;

INSERT INTO settings (key, value, description) VALUES
  ('auto_payouts_enabled', 'true', 'Глобальное включение автовыплат продавцов'),
  ('auto_payout_min_balance', '500', 'Минимальный баланс для автовыплаты'),
  ('auto_payout_interval_hours', '24', 'Интервал проверки автовыплат'),
  ('usdt_rub_rate_fallback', '90', 'Резервный курс USDT/RUB, если ЦБ недоступен'),
  ('terms_title', 'Правила SellWay', 'Заголовок правил площадки'),
  ('terms_content', '', 'Текст правил площадки в свободной форме')
ON CONFLICT (key) DO NOTHING;

UPDATE settings SET value='0' WHERE key='withdraw_method_crypto_commission';
