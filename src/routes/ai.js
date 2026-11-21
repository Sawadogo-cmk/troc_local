// Routes IA : état, recherche en langage naturel, réponses suggérées
const router = require('express').Router();
const db = require('../db');
const ai = require('../ai');
const { requireAuth } = require('../middleware/auth');

// Limite simple par adresse IP pour maîtriser le coût des appels à l'IA
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Trop de demandes à l\'assistant. Réessayez dans quelques minutes.' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

function requireAi(req, res, next) {
  if (!ai.enabled) return res.status(503).json({ error: 'L\'assistant IA n\'est pas activé sur ce site.' });
  next();
}

router.get('/status', (req, res) => res.json({ enabled: ai.enabled }));

// « un truc pour faire du sport pas loin de Ouaga 2000 » → mots-clés, catégorie, ville
router.post('/search', requireAi, rateLimit(20, 10 * 60 * 1000), async (req, res, next) => {
  try {
    const query = String(req.body.query || '').trim().slice(0, 300);
    if (query.length < 3) return res.status(400).json({ error: 'Décrivez un peu plus ce que vous cherchez.' });
    const [categories] = await db.query('SELECT id, name FROM categories');
    const result = await ai.interpretSearch(query, categories);
    if (!result) return res.status(502).json({ error: 'L\'assistant n\'a pas pu répondre. La recherche classique reste disponible.' });
    const category = categories.find((c) => c.name === result.category);
    res.json({
      keywords: result.keywords.trim(),
      category_id: category?.id ?? null,
      category: category?.name ?? null,
      city: result.city.trim(),
      summary: result.summary,
    });
  } catch (err) { next(err); }
});

// Trois réponses courtes pour la conversation en cours (à la demande, pour limiter les coûts)
router.post('/suggestions/:conversationId', requireAuth, requireAi, rateLimit(30, 10 * 60 * 1000), async (req, res, next) => {
  try {
    const me = req.session.userId;
    const [[conv]] = await db.execute(
      `SELECT c.*, i.title, i.status, i.user_id AS owner_id, ub.username AS buyer, us.username AS seller
         FROM conversations c JOIN items i ON i.id = c.item_id
         JOIN users ub ON ub.id = c.buyer_id JOIN users us ON us.id = c.seller_id
        WHERE c.id = ? AND (c.buyer_id = ? OR c.seller_id = ?)`,
      [req.params.conversationId, me, me]
    );
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });
    const [messages] = await db.execute(
      `SELECT sender_id, content FROM (
         SELECT id, sender_id, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 12
       ) recent ORDER BY id`, [conv.id]
    );
    const iAmOwner = conv.owner_id === me;
    const result = await ai.suggestReplies({
      item: conv,
      me: { id: me, username: iAmOwner ? conv.seller : conv.buyer },
      other: iAmOwner ? conv.buyer : conv.seller,
      iAmOwner,
      messages,
    });
    if (!result) return res.status(502).json({ error: 'Pas de suggestion pour le moment.' });
    res.json({ suggestions: result.suggestions.map((s) => s.trim()).filter(Boolean).slice(0, 3) });
  } catch (err) { next(err); }
});

module.exports = router;
