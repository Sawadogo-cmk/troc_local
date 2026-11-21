const router = require('express').Router();
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { geocode, DISTANCE_SQL } = require('../geo');
const { UPLOAD_DIR, processPhoto, deletePhoto } = require('../images');
const ai = require('../ai');
const { moderateInBackground } = require('../moderation');

const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + ALLOWED[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(new Error('Format accepté : JPG, PNG ou WebP'));
  },
});

const FIRST_PHOTO = '(SELECT filename FROM item_photos p WHERE p.item_id = i.id ORDER BY position LIMIT 1)';

// Liste avec recherche, filtres et pagination
router.get('/', async (req, res, next) => {
  try {
    const { q, category, city, status = 'disponible', mine } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 12;
    const where = [];
    const params = [];

    if (q)        { where.push('MATCH(i.title, i.description) AGAINST (? IN BOOLEAN MODE)'); params.push(q + '*'); }
    if (category) { where.push('i.category_id = ?'); params.push(Number(category)); }
    if (city)     { where.push('i.city LIKE ?'); params.push(city + '%'); }
    if (mine && req.session.userId) { where.push('i.user_id = ?'); params.push(req.session.userId); }
    else {
      where.push("i.moderation_status = 'approved'");
      if (status) { where.push('i.status = ?'); params.push(status); }
    }

    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const userId = req.session.userId || 0;

    const [rows] = await db.query(
      `SELECT i.id, i.title, i.city, i.status, i.item_condition, i.created_at, i.moderation_status,
              c.name AS category, u.username, ${FIRST_PHOTO} AS photo,
              EXISTS(SELECT 1 FROM favorites f WHERE f.item_id = i.id AND f.user_id = ?) AS is_favorite
         FROM items i
         JOIN categories c ON c.id = i.category_id
         JOIN users u ON u.id = i.user_id
         ${whereSql}
         ORDER BY i.created_at DESC
         LIMIT ? OFFSET ?`,
      [userId, ...params, limit, (page - 1) * limit]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM items i ${whereSql}`, params
    );
    res.json({ items: rows, page, pages: Math.ceil(total / limit), total });
  } catch (err) { next(err); }
});

// Carte : objets disponibles géolocalisés, triés par distance si une position est fournie
router.get('/map', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = Math.min(1000, Math.max(1, parseFloat(req.query.radius) || 10));
    const hasPos = Number.isFinite(lat) && Number.isFinite(lng);
    const params = [];
    let distance = 'NULL';
    let having = '';
    if (hasPos) {
      distance = DISTANCE_SQL;
      params.push(lat, lat, lng);
      having = 'HAVING distance_km <= ?';
    }
    const where = ["i.status = 'disponible'", "i.moderation_status = 'approved'", 'i.lat IS NOT NULL'];
    if (req.query.category) { where.push('i.category_id = ?'); params.push(Number(req.query.category)); }
    if (hasPos) params.push(radius);

    const [rows] = await db.query(
      `SELECT i.id, i.title, i.city, i.item_condition, i.lat, i.lng, c.name AS category,
              ${FIRST_PHOTO} AS photo, ${distance} AS distance_km
         FROM items i JOIN categories c ON c.id = i.category_id
        WHERE ${where.join(' AND ')}
        ${having}
        ORDER BY ${hasPos ? 'distance_km,' : ''} i.created_at DESC
        LIMIT 300`,
      params
    );
    res.json(rows.map((r) => ({
      ...r, lat: Number(r.lat), lng: Number(r.lng),
      distance_km: r.distance_km == null ? null : Math.round(r.distance_km * 10) / 10,
    })));
  } catch (err) { next(err); }
});

// Géocodage d'une ville saisie sur la carte
router.get('/geocode', async (req, res, next) => {
  try {
    const pos = await geocode(req.query.city);
    if (!pos) return res.status(404).json({ error: 'Ville introuvable. Vérifiez l\'orthographe.' });
    res.json(pos);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const me = req.session.userId || 0;
    const [rows] = await db.execute(
      `SELECT i.*, c.name AS category, u.username, g.username AS given_to_username,
              EXISTS(SELECT 1 FROM favorites f WHERE f.item_id = i.id AND f.user_id = ?) AS is_favorite,
              EXISTS(SELECT 1 FROM reviews r WHERE r.item_id = i.id AND r.reviewer_id = ?) AS has_reviewed
         FROM items i
         JOIN categories c ON c.id = i.category_id
         JOIN users u ON u.id = i.user_id
         LEFT JOIN users g ON g.id = i.given_to_id
        WHERE i.id = ?`,
      [me, me, req.params.id]
    );
    const item = rows[0];
    // Annonce en vérification ou refusée : visible uniquement par son auteur
    if (!item || (item.moderation_status !== 'approved' && item.user_id !== me)) {
      return res.status(404).json({ error: 'Annonce introuvable' });
    }
    const [photos] = await db.execute(
      'SELECT filename FROM item_photos WHERE item_id = ? ORDER BY position', [req.params.id]
    );
    // Avis possible si l'objet a été donné et que l'on est le donneur ou le receveur
    const canReview = item.status === 'donne' && item.given_to_id && !item.has_reviewed
      && (me === item.user_id || me === item.given_to_id);
    res.json({ ...item, lat: undefined, lng: undefined, photos: photos.map((p) => p.filename), can_review: Boolean(canReview) });
  } catch (err) { next(err); }
});

// Personnes ayant écrit au propriétaire à propos de l'objet (pour indiquer à qui il a été donné)
router.get('/:id/candidates', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.username FROM conversations c
         JOIN items i ON i.id = c.item_id
         JOIN users u ON u.id = c.buyer_id
        WHERE c.item_id = ? AND i.user_id = ?
        ORDER BY u.username`,
      [req.params.id, req.session.userId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', requireAuth, upload.array('photos', 5), async (req, res, next) => {
  const files = req.files || [];
  const conn = await db.getConnection();
  try {
    const { title, description, category_id, item_condition, city } = req.body;
    if (!title?.trim() || !description?.trim() || !category_id || !city?.trim()) {
      await Promise.all(files.map((f) => deletePhoto(f.filename)));
      return res.status(400).json({ error: 'Remplissez le titre, la description, la catégorie et la ville.' });
    }
    await Promise.all(files.map((f) => processPhoto(f.filename)));
    const pos = await geocode(city);
    const moderation = ai.enabled ? 'pending' : 'approved';

    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO items (user_id, category_id, title, description, item_condition, city, lat, lng, moderation_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.session.userId, category_id, title.trim(), description.trim(), item_condition || 'bon',
        city.trim(), pos?.lat ?? null, pos?.lng ?? null, moderation]
    );
    for (const [i, file] of files.entries()) {
      await conn.execute(
        'INSERT INTO item_photos (item_id, filename, position) VALUES (?, ?, ?)',
        [result.insertId, file.filename, i]
      );
    }
    await conn.commit();
    if (moderation === 'pending') moderateInBackground(result.insertId);
    res.status(201).json({ id: result.insertId, moderation_status: moderation });
  } catch (err) {
    await conn.rollback().catch(() => {});
    await Promise.all(files.map((f) => deletePhoto(f.filename)));
    next(err);
  } finally {
    conn.release();
  }
});

// Changer le statut (disponible / réservé / donné) : propriétaire uniquement
router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['disponible', 'reserve', 'donne'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    let givenTo = null;
    if (status === 'donne' && req.body.given_to_id) {
      // Le receveur doit avoir écrit au propriétaire à propos de cet objet
      const [ok] = await db.execute(
        'SELECT 1 FROM conversations WHERE item_id = ? AND buyer_id = ? AND seller_id = ?',
        [req.params.id, req.body.given_to_id, req.session.userId]
      );
      if (!ok.length) return res.status(400).json({ error: 'Cette personne ne vous a pas contacté pour cet objet.' });
      givenTo = Number(req.body.given_to_id);
    }
    const [result] = await db.execute(
      `UPDATE items SET status = ?, given_to_id = ?, given_at = IF(? = 'donne', COALESCE(given_at, NOW()), NULL)
        WHERE id = ? AND user_id = ?`,
      [status, givenTo, status, req.params.id, req.session.userId]
    );
    if (!result.affectedRows) return res.status(403).json({ error: 'Action non autorisée' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const [photos] = await db.execute(
      `SELECT p.filename FROM item_photos p JOIN items i ON i.id = p.item_id
        WHERE i.id = ? AND i.user_id = ?`,
      [req.params.id, req.session.userId]
    );
    const [result] = await db.execute(
      'DELETE FROM items WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]
    );
    if (!result.affectedRows) return res.status(403).json({ error: 'Action non autorisée' });
    await Promise.all(photos.map((p) => deletePhoto(p.filename)));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
