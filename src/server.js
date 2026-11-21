require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const db = require('./db');
const realtime = require('./realtime');
const { UPLOAD_DIR } = require('./images');
const { sessionStore, csrfToken, csrfProtection } = require('./security');

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET manquant : copiez .env.example vers .env et renseignez-le.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
app.disable('x-powered-by');

// En-têtes de sécurité (Front-End Checklist / OWASP)
app.use((req, res, next) => {
  const host = req.headers.host;
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://tile.openstreetmap.org",
      `connect-src 'self' ws://${host} wss://${host}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  });
  next();
});

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === 'production', // cookie envoyé uniquement en HTTPS en production
  },
});
app.use(express.json({ limit: '100kb' }));
app.use(sessionMiddleware);

// Jeton CSRF pour le client, puis contrôle de chaque requête qui modifie des données
app.get('/api/csrf', (req, res) => res.json({ token: csrfToken(req) }));
app.use('/api', csrfProtection);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/users', require('./routes/users'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/ai', require('./routes/ai'));

app.get('/api/categories', async (req, res, next) => {
  try {
    const [rows] = await db.query("SELECT id, name FROM categories ORDER BY name = 'Autre', name");
    res.json(rows);
  } catch (err) { next(err); }
});

// Compteur d'impact global
app.get('/api/stats', async (req, res, next) => {
  try {
    const [[stats]] = await db.query(
      `SELECT COUNT(*) AS given, COALESCE(SUM(c.avg_weight_kg), 0) AS kg
         FROM items i JOIN categories c ON c.id = i.category_id
        WHERE i.status = 'donne'`
    );
    const [[{ members }]] = await db.query('SELECT COUNT(*) AS members FROM users');
    res.json({ given: stats.given, kg: Math.round(Number(stats.kg)), members });
  } catch (err) { next(err); }
});

// 404 : JSON pour l'API, page dédiée pour le reste
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ressource introuvable' });
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

// Gestion centralisée des erreurs
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'MulterError' || err.message?.startsWith('Format')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Erreur serveur' });
});

realtime.init(server, sessionMiddleware);

const ai = require('./ai');
console.log(ai.enabled ? `Assistant IA activé (${ai.MODEL})` : 'Assistant IA désactivé : ajoutez ANTHROPIC_API_KEY dans .env pour l\'activer');
require('./moderation').sweepPending().catch((err) => console.error('[modération]', err.message));

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Troc Local : http://localhost:${port}`));
