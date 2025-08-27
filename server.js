// ==== server.js (Producción/Dev alineado con routers originales) ====
// Modo estricto
'use strict';

// 1) Variables de entorno primero
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (!process.env.JWT_SECRET) {
  console.error("CRÍTICO: La variable JWT_SECRET no está definida en .env");
  process.exit(1);
}

// 2) Dependencias
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

// 3) DB y utilidades
const db = require('./db/connection');
const initializeDatabase = require('./db/init');

// 4) Middlewares de auth
const { authenticateToken, authorizeAdmin } = require('./middleware/auth');

// 5) Routers originales
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const { router: adminRoutes, exportToCsv } = require('./routes/admin'); 

// 6) App
const app = express();
const PORT = Number(process.env.PORT || 4000);
const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';

app.use('/data', express.static(
  path.join(__dirname, 'public', 'data'),
  { maxAge: '30d', etag: true }
));


// 7) Seguridad (Helmet + CSP) — permitir CDNs necesarios del front
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "upgrade-insecure-requests": [],

      // XHR/Fetch
      "connect-src": [
        "'self'",
        "data:",
        "blob:",
        "http://localhost:4000",
        "https://www.electrosoundpack.com",
        "https://www.electrosoundpack.com"
      ],

      // CSS desde self + Google Fonts + cdnjs (Font Awesome)
      "style-src": [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com"
      ],

      // 🔧 Fuentes: permitir cdnjs (Font Awesome) + Google Fonts + data:
      "font-src": [
        "'self'",
        "data:",
        "https://cdnjs.cloudflare.com",
        "https://fonts.gstatic.com"
      ],

      // Imágenes (incluye blobs para previews y Metricool)
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        "http://localhost:4000",
        "https://www.electrosoundpack.com",
        "https://www.electrosoundpack.com",
        "https://tracker.metricool.com"
      ],

      "media-src": ["'self'", "data:", "blob:"],
      "script-src": ["'self'", "'unsafe-inline'"]
    }
  }
}));


// 8) CORS (por si accedés desde otros orígenes en dev)
const ALLOWED_ORIGINS = new Set([
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost',
  'https://www.electrosoundpack.com',
  'https://www.electrosoundpack.com'
]);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error('Origen no permitido por CORS: ' + origin), false);
  }
}));

// 9) Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 10) Archivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProd ? '1h' : 0,
  etag: true,
  lastModified: true,
  extensions: ['html']
}));

// 11) Endpoints utilitarios
app.get('/api/ping', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/db-last-modified', async (_req, res) => {
  try {
    const fs = require('fs').promises;
    const dbPath = path.join(__dirname, 'database.db');
    const stat = await fs.stat(dbPath);
    res.json({ lastModified: stat.mtime.toISOString() });
  } catch {
    res.json({ lastModified: null });
  }
});

// 12) Routers montados (alineado con el front/admin originales)
app.use('/api/auth', authRoutes); // /register, /login, etc.
app.use('/api/products', productsRoutes); // público
app.use('/api/cart', authenticateToken, cartRoutes); // GET / (cargar), POST /save
app.use('/api/admin', authenticateToken, authorizeAdmin, adminRoutes); // CRUD/uploads

// 🛠️ NUEVO: Endpoint de exportación de CSV protegido
// Este endpoint maneja la descarga de CSV para cualquier tabla (ej. productos, usuarios).
app.get('/api/export/:tabla', authenticateToken, authorizeAdmin, exportToCsv);

// 13) Home y fallback
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 14) Arranque tras inicializar DB
let httpServer = null;

initializeDatabase()
  .then(() => {
    httpServer = app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ La aplicación no pudo iniciar por un error en la base de datos.");
    console.error(err);
    process.exit(1);
  });

// 15) Apagado limpio — SOLO SIGTERM (alineado con PM2)
function logSignalDetails(sig) {
  console.warn(`⚠️ Señal recibida: ${sig} | pid=${process.pid} ppid=${process.ppid} (NODE_ENV=${process.env.NODE_ENV || 'undefined'})`);
}
function shutdown() {
  console.log('Cerrando el servidor...');
  const closeServer = () => new Promise(r => httpServer ? httpServer.close(() => r()) : r());
  const closeDb = () => new Promise(r => {
    try { db.close(() => { console.log('✅ Base de datos cerrada.'); r(); }); }
    catch (e) { console.error('⚠️ Error cerrando DB:', e.message); r(); }
  });
  Promise.allSettled([closeServer(), closeDb()]).finally(() => process.exit(0));
}

process.on('SIGTERM', () => { logSignalDetails('SIGTERM'); shutdown(); });
// En desarrollo, permitir Ctrl+C
if (!isProd) process.on('SIGINT', () => { logSignalDetails('SIGINT'); shutdown(); });

// 16) Robustez extra
process.on('uncaughtException', (err) => console.error('❌ uncaughtException:', err));
process.on('unhandledRejection', (reason) => console.error('❌ unhandledRejection:', reason));