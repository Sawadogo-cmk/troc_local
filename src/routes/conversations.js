const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const realtime = require('../realtime');

// Enregistre un message et le pousse en temps réel aux deux participants
async function sendMessage(conv, senderId, content) {
  const [r] = await db.execute(
    'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
    [conv.id, senderId, content]
  );
  const [[msg]] = await db.execute(
    `SELECT m.id, m.content, m.created_at, m.sender_id, u.username, i.title AS item_title
       FROM messages m JOIN users u ON u.id = m.sender_id
       JOIN conversations c ON c.id = m.conversation_id JOIN items i ON i.id = c.item_id
      WHERE m.id = ?`, [r.insertId]
  );
  realtime.notify([conv.buyer_id, conv.seller_id], 'message', { conversationId: conv.id, message: msg });
}

router.use(requireAuth);

// Vérifie que l'utilisateur participe bien à la conversation
async function getConversation(id, userId) {
  const [rows] = await db.execute(
    'SELECT * FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
    [id, userId, userId]
  );
  return rows[0];
}

// Liste des conversations avec dernier message et nombre de non-lus
router.get('/', async (req, res, next) => {
  try {
    const uid = req.session.userId;
    const [rows] = await db.execute(
      `SELECT c.id, c.item_id, i.title AS item_title,
              (SELECT filename FROM item_photos p WHERE p.item_id = i.id ORDER BY position LIMIT 1) AS item_photo,
              IF(c.buyer_id = ?, us.username, ub.username) AS other_user,
              (SELECT content FROM messages m WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message,
              (SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
                 AND m.sender_id <> ? AND m.read_at IS NULL) AS unread
         FROM conversations c
         JOIN items i  ON i.id = c.item_id
         JOIN users ub ON ub.id = c.buyer_id
         JOIN users us ON us.id = c.seller_id
        WHERE c.buyer_id = ? OR c.seller_id = ?
        ORDER BY last_at DESC`,
      [uid, uid, uid, uid]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Démarrer (ou reprendre) une conversation à propos d'un objet
router.post('/', async (req, res, next) => {
  try {
    const { itemId, content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Message vide' });
    const [items] = await db.execute('SELECT user_id FROM items WHERE id = ?', [itemId]);
    if (!items[0]) return res.status(404).json({ error: 'Annonce introuvable' });
    if (items[0].user_id === req.session.userId) {
      return res.status(400).json({ error: "C'est votre propre annonce" });
    }
    // insertId renvoie l'id existant grâce à LAST_INSERT_ID(id), sur la même connexion
    const [{ insertId: id }] = await db.execute(
      `INSERT INTO conversations (item_id, buyer_id, seller_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [itemId, req.session.userId, items[0].user_id]
    );
    await sendMessage({ id, buyer_id: req.session.userId, seller_id: items[0].user_id }, req.session.userId, content.trim());
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const conv = await getConversation(req.params.id, req.session.userId);
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });
    const [rows] = await db.execute(
      `SELECT m.id, m.content, m.created_at, m.sender_id, u.username,
              m.sender_id = ? AS is_mine
         FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at, m.id`,
      [req.session.userId, conv.id]
    );
    await db.execute(
      `UPDATE messages SET read_at = NOW()
        WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL`,
      [conv.id, req.session.userId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    const conv = await getConversation(req.params.id, req.session.userId);
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });
    const content = req.body.content?.trim();
    if (!content) return res.status(400).json({ error: 'Message vide' });
    await sendMessage(conv, req.session.userId, content);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
