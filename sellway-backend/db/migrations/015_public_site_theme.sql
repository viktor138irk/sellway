INSERT INTO settings (key, value, description)
VALUES ('public_site_theme', 'clear', 'Тема публичной витрины: clear или classic')
ON CONFLICT (key) DO NOTHING;
