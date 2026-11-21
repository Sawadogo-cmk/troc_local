const router = require('express').Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const { geocode } = require('../geo');
const { loginLimiter, registerLimiter } = require('../security');

const tooMany = (res) => res.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });

router.post('/register', async (req, res, next) => {
  try {
    if (registerLimiter.blocked(req.ip)) return tooMany(res);
    const { username, email, password, city } = req.body;
    if (!username || !email || !password || !city) {
      return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
    }
    const hash = await bcrypt.hash(password, 12);
    const pos = await geocode(city);
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash, city, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
      [username.trim(), email.trim().toLowerCase(), hash, city.trim(), pos?.lat ?? null, pos?.lng ?? null]
    );
    registerLimiter.fail(req.ip); // compte aussi les créations, pour limiter les comptes en masse
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = result.insertId;
      res.status(201).json({ id: result.insertId, username, city });
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email ou pseudo déjà utilisé' });
    }
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const key = `${req.ip}|${String(email || '').trim().toLowerCase()}`;
    if (loginLimiter.blocked(key)) return tooMany(res);
    const [rows] = await db.execute(
      'SELECT id, username, city, password_hash FROM users WHERE email = ?',
      [String(email || '').trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
      loginLimiter.fail(key);
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    loginLimiter.reset(key);
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username, city: user.city });
    });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.session.userId) return res.json(null);
    const [rows] = await db.execute(
      'SELECT id, username, city, lat, lng FROM users WHERE id = ?', [req.session.userId]
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

module.exports = router;
