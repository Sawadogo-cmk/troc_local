const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT i.id, i.title, i.city, i.status, i.item_condition, i.created_at, 1 AS is_favorite,
              (SELECT filename FROM item_photos p WHERE p.item_id = i.id ORDER BY position LIMIT 1) AS photo
         FROM favorites f JOIN items i ON i.id = f.item_id
        WHERE f.user_id = ? AND i.moderation_status = 'approved'
        ORDER BY f.created_at DESC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:itemId', async (req, res, next) => {
  try {
    await db.execute(
      'INSERT IGNORE INTO favorites (user_id, item_id) VALUES (?, ?)',
      [req.session.userId, req.params.itemId]
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:itemId', async (req, res, next) => {
  try {
    await db.execute(
      'DELETE FROM favorites WHERE user_id = ? AND item_id = ?',
      [req.session.userId, req.params.itemId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
