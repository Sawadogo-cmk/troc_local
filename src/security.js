// Sécurité : sessions persistantes en base, protection CSRF, limite des tentatives de connexion.
const crypto = require('crypto');
const MySQLStore = require('express-mysql-session')(require('express-session'));

// Sessions stockées en MySQL : elles survivent au redémarrage du serveur
function sessionStore() {
  return new MySQLStore({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 7 * 24 * 60 * 60 * 1000,
    createDatabaseTable: true,
  });
}

// CSRF « synchronizer token » : le jeton vit dans la session, le client le renvoie dans l'en-tête X-CSRF-Token.
// Un site tiers ne peut pas lire ce jeton, donc il ne peut pas envoyer de requête qui modifie les données.
function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token') || '';
  const expected = req.session.csrf || '';
  const ok = sent.length === expected.length && expected.length > 0
    && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return res.status(403).json({ error: 'Session expirée : rechargez la page.', code: 'CSRF' });
  next();
}

// Limite de tentatives : après `max` échecs dans la fenêtre, l'adresse est bloquée temporairement
function failureLimiter({ max, windowMs }) {
  const failures = new Map();
  const clean = () => {
    const now = Date.now();
    for (const [key, list] of failures) {
      const recent = list.filter((t) => now - t < windowMs);
      if (recent.length) failures.set(key, recent); else failures.delete(key);
    }
  };
  setInterval(clean, windowMs).unref();
  return {
    blocked(key) {
      const recent = (failures.get(key) || []).filter((t) => Date.now() - t < windowMs);
      return recent.length >= max;
    },
    fail(key) {
      failures.set(key, [...(failures.get(key) || []), Date.now()]);
    },
    reset(key) {
      failures.delete(key);
    },
  };
}

const loginLimiter = failureLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
const registerLimiter = failureLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

module.exports = { sessionStore, csrfToken, csrfProtection, loginLimiter, registerLimiter };
