INSERT INTO settings (key, value, description) VALUES
  ('seo_yandex_metrika_id', '', 'ID счетчика Яндекс Метрики'),
  ('seo_google_analytics_id', '', 'Measurement ID Google Analytics')
ON CONFLICT (key) DO NOTHING;
