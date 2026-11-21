// Profils publics : statistiques, badges, impact, annonces et avis reçus
const router = require('express').Router();
const db = require('../db');

function badges({ given, received, rating, reviews, memberDays }) {
  const list = [];
  if (given >= 1) list.push({ id: 'premier-don', label: 'Premier don', hint: 'A donné son premier objet' });
  if (given >= 5) list.push({ id: 'genereux', label: 'Main généreuse', hint: '5 objets donnés ou plus' });
  if (given >= 10) list.push({ id: 'pilier', label: 'Pilier du quartier', hint: '10 objets donnés ou plus' });
  if (received >= 3) list.push({ id: 'chineur', label: 'Chineur', hint: 'A récupéré 3 objets ou plus' });
  if (reviews >= 2 && rating >= 4.5) list.push({ id: 'fiable', label: 'Très fiable', hint: 'Note moyenne de 4,5 ou plus' });
  if (memberDays >= 365) list.push({ id: 'ancien', label: 'Membre depuis plus d\'un an', hint: '' });
  return list;
}

router.get('/:username', async (req, res, next) => {
  try {
    const [[user]] = await db.execute(
      'SELECT id, username, city, created_at FROM users WHERE username = ?', [req.params.username]
    );
    if (!user) return res.status(404).json({ error: 'Ce membre n\'existe pas' });
    const isMe = req.session.userId === user.id;

    const [[given]] = await db.execute(
      `SELECT COUNT(*) AS n, COALESCE(SUM(c.avg_weight_kg), 0) AS kg
         FROM items i JOIN categories c ON c.id = i.category_id
        WHERE i.user_id = ? AND i.status = 'donne'`, [user.id]
    );
    const [[received]] = await db.execute(
      'SELECT COUNT(*) AS n FROM items WHERE given_to_id = ?', [user.id]
    );
    const [[rating]] = await db.execute(
      'SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE reviewee_id = ?', [user.id]
    );
    // Le propriétaire voit toutes ses annonces, les visiteurs seulement celles encore disponibles
    const [items] = await db.execute(
      `SELECT i.id, i.title, i.city, i.status, i.item_condition, i.created_at,
              i.moderation_status,
              (SELECT filename FROM item_photos p WHERE p.item_id = i.id ORDER BY position LIMIT 1) AS photo,
              EXISTS(SELECT 1 FROM favorites f WHERE f.item_id = i.id AND f.user_id = ?) AS is_favorite
         FROM items i
        WHERE i.user_id = ? ${isMe ? '' : "AND i.status <> 'donne' AND i.moderation_status = 'approved'"}
        ORDER BY i.status = 'donne', i.created_at DESC`,
      [req.session.userId || 0, user.id]
    );
    const [reviews] = await db.execute(
      `SELECT r.rating, r.comment, r.created_at, u.username AS reviewer, i.title AS item_title,
              i.user_id = r.reviewer_id AS reviewer_was_giver
         FROM reviews r
         JOIN users u ON u.id = r.reviewer_id
         JOIN items i ON i.id = r.item_id
        WHERE r.reviewee_id = ?
        ORDER BY r.created_at DESC`, [user.id]
    );

    const avg = rating.avg == null ? null : Math.round(Number(rating.avg) * 10) / 10;
    const memberDays = (Date.now() - new Date(user.created_at)) / 86400000;
    res.json({
      ...user,
      is_me: isMe,
      stats: {
        given: given.n, received: received.n, kg: Math.round(Number(given.kg) * 10) / 10,
        rating: avg, reviews: rating.n,
      },
      badges: badges({ given: given.n, received: received.n, rating: avg, reviews: rating.n, memberDays }),
      items,
      reviews,
    });
  } catch (err) { next(err); }
});

module.exports = router;
