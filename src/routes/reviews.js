// Avis après un don : le donneur note le receveur et inversement, une fois par objet
const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const me = req.session.userId;
    const itemId = Number(req.body.itemId);
    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || '').trim().slice(0, 500);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Choisissez une note de 1 à 5 étoiles.' });
    }
    const [[item]] = await db.execute(
      'SELECT id, user_id, given_to_id, status, title FROM items WHERE id = ?', [itemId]
    );
    if (!item) return res.status(404).json({ error: 'Annonce introuvable' });
    if (item.status !== 'donne' || !item.given_to_id) {
      return res.status(400).json({ error: 'On ne peut laisser un avis qu\'une fois l\'objet donné.' });
    }
    let reviewee;
    if (me === item.user_id) reviewee = item.given_to_id;
    else if (me === item.given_to_id) reviewee = item.user_id;
    else return res.status(403).json({ error: 'Seules les deux personnes de l\'échange peuvent laisser un avis.' });

    await db.execute(
      'INSERT INTO reviews (item_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [itemId, me, reviewee, rating, comment]
    );
    realtime.notify(reviewee, 'review', { itemTitle: item.title, rating });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Vous avez déjà laissé un avis pour cet échange.' });
    next(err);
  }
});

module.exports = router;
