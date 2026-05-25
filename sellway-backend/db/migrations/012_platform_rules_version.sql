INSERT INTO settings (key, value, description) VALUES
  ('terms_title', 'Правила торговой площадки SellWay.pro', 'Заголовок правил площадки'),
  ('terms_version', '2026-05-25', 'Версия правил площадки')
ON CONFLICT (key) DO UPDATE SET
  value = CASE
    WHEN settings.value IN ('', 'Правила SellWay', '1.0', '2026-05-24') THEN EXCLUDED.value
    ELSE settings.value
  END,
  updated_at = NOW();
