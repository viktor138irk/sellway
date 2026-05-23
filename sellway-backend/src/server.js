require('dotenv').config();
const express  = require('express');
const http     = require('http');
const cors     = require('cors');
const helmet   = require('helmet');
const rateLimit = require('express-rate-limit');
const path     = require('path');
const fs       = require('fs');
const logger   = require('./config/logger');
const { pool } = require('./config/db');
const wsServer = require('./ws/server');

const app    = express();
const server = http.createServer(app);

['uploads','logs'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: [process.env.FRONTEND_URL||'https://sellway.pro','http://localhost:5173'], credentials: true }));
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 30, message: { error: 'Слишком много запросов' } }));
app.use('/api',      rateLimit({ windowMs: 60*1000,    max: 120 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname,'..','uploads')));

app.use((req, res, next) => { const s = Date.now(); res.on('finish', () => { if (!req.path.includes('/health')) logger.info(`${req.method} ${req.path}`, { status: res.statusCode, ms: Date.now()-s }); }); next(); });

app.get('/health', async (req, res) => { try { await pool.query('SELECT 1'); res.json({ status:'ok', service:'SellWay API' }); } catch { res.status(503).json({ status:'error' }); } });

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/products',      require('./routes/products'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/categories',    require('./routes/categories'));
app.use('/api/seller',        require('./routes/seller'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/payments',      require('./routes/payments'));

app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));
app.use((err, req, res, next) => { logger.error('Error', { err: err.message }); res.status(err.status||500).json({ error: process.env.NODE_ENV==='production' ? 'Внутренняя ошибка' : err.message }); });

wsServer.setup(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 SellWay запущен на порту ${PORT}`);
  logger.info(`   WebSocket: /ws/orders/:id`);
  logger.info(`   ЮKassa webhook: /api/payments/webhook`);
});

process.on('SIGTERM', async () => { server.close(() => pool.end().then(() => process.exit(0))); });
process.on('unhandledRejection', (r) => logger.error('Unhandled rejection', { reason: String(r) }));
module.exports = { app, server };
