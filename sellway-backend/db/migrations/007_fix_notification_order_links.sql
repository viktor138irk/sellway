UPDATE notifications
SET link = regexp_replace(link, '^/seller/orders/', '/orders/')
WHERE link LIKE '/seller/orders/%';
