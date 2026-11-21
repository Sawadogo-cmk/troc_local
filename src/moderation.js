// Modération des nouvelles annonces par l'IA, en arrière-plan.
// Une annonce reste masquée (« pending ») pendant la vérification ; son auteur est prévenu en temps réel du résultat.
const path = require('path');
const fs = require('fs/promises');
const db = require('./db');
const ai = require('./ai');
const realtime = require('./realtime');
const { UPLOAD_DIR, variantName } = require('./images');

async function moderateItem(itemId) {
  const [[item]] = await db.execute(
    `SELECT i.id, i.user_id, i.title, i.description, c.name AS category,
            (SELECT filename FROM item_photos p WHERE p.item_id = i.id ORDER BY position LIMIT 1) AS photo
       FROM items i JOIN categories c ON c.id = i.category_id WHERE i.id = ?`, [itemId]
  );
  if (!item) return;

  let photo = null;
  if (item.photo) {
    photo = await fs.readFile(path.join(UPLOAD_DIR, variantName(item.photo, 800))).then((b) => b.toString('base64')).catch(() => null);
  }
  const verdict = await ai.moderateListing({ ...item, photo });

  // IA indisponible ou en erreur : on publie quand même plutôt que de bloquer les membres
  const status = verdict?.decision === 'refused' ? 'refused' : 'approved';
  const reason = status === 'refused' ? (verdict.reason || 'Cette annonce ne respecte pas les règles du site.').slice(0, 300) : null;
  await db.execute('UPDATE items SET moderation_status = ?, moderation_reason = ? WHERE id = ?', [status, reason, item.id]);
  realtime.notify(item.user_id, 'moderation', { itemId: item.id, title: item.title, status, reason });
  if (!verdict) console.warn(`[modération] annonce ${item.id} publiée sans vérification (IA indisponible)`);
}

// Lancée sans attendre : la publication répond tout de suite
function moderateInBackground(itemId) {
  moderateItem(itemId).catch(async (err) => {
    console.error('[modération]', err.message);
    await db.execute("UPDATE items SET moderation_status = 'approved' WHERE id = ? AND moderation_status = 'pending'", [itemId]).catch(() => {});
  });
}

// Au démarrage : reprend les annonces restées en attente (serveur arrêté pendant une vérification)
async function sweepPending() {
  const [rows] = await db.query("SELECT id FROM items WHERE moderation_status = 'pending' ORDER BY id");
  for (const { id } of rows) {
    if (ai.enabled) await moderateItem(id).catch((err) => console.error('[modération]', err.message));
    else await db.execute("UPDATE items SET moderation_status = 'approved' WHERE id = ?", [id]);
  }
}

module.exports = { moderateInBackground, sweepPending };
