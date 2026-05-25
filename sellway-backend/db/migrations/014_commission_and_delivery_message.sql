ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS custom_withdrawal_commission_rate DECIMAL(6,4);

INSERT INTO settings (key, value, description) VALUES
  ('default_seller_commission_rate', '0.07', 'Комиссия с продаж по умолчанию'),
  ('withdrawal_commission', '0.02', 'Базовая комиссия вывода, если для метода не задана своя')
ON CONFLICT (key) DO NOTHING;

