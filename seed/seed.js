// Données de démonstration : 4 comptes, 15 annonces avec photos, conversations.
// Relançable sans risque : ne touche qu'aux comptes listés ci-dessous (et à leurs annonces).
require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../src/db');
const { geocode } = require('../src/geo');
const { processPhoto, deletePhoto } = require('../src/images');

const PHOTOS_DIR = path.join(__dirname, 'photos');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const PASSWORD = 'demo12345';

const USERS = [
  { username: 'demo', email: 'demo@exemple.fr', city: 'Ouagadougou' },
  { username: 'awa_k', email: 'awa@exemple.fr', city: 'Ouaga 2000' },
  { username: 'issouf_s', email: 'issouf@exemple.fr', city: 'Ouagadougou' },
  { username: 'mariam.t', email: 'mariam@exemple.fr', city: 'Bobo-Dioulasso' },
];

// Comptes de démo des versions précédentes, supprimés avec leurs annonces
const LEGACY_EMAILS = ['sophie@exemple.fr', 'karim@exemple.fr', 'jeanne@exemple.fr'];

// [photo, catégorie, titre, état, propriétaire, statut, description, donné à]
const ITEMS = [
  ['chaise', 'Maison', 'Chaise bistrot en bois courbé', 'tres_bon', 'awa_k', 'disponible',
    'Je déménage et je ne peux pas tout emporter. Assise solide, aucun pied ne bouge. Petite trace d\'usure sur le dossier.'],
  ['theiere', 'Maison', 'Théière en porcelaine blanche et bleue', 'bon', 'mariam.t', 'disponible',
    'Environ 1 litre, couvercle d\'origine, aucun éclat. Je l\'échangerais volontiers contre une bouilloire, sinon je la donne.'],
  ['pull', 'Vêtements', 'Pull en laine jacquard, taille M', 'tres_bon', 'issouf_s', 'disponible',
    'Porté une seule saison. Très chaud pour les nuits d\'harmattan, il gratte un peu les premiers jours. Lavé à la main.'],
  ['baskets', 'Vêtements', 'Baskets blanches en toile, pointure 39', 'bon', 'demo', 'disponible',
    'Un peu trop petites pour moi. Semelles en bon état, lavées en machine.'],
  ['echarpes', 'Vêtements', 'Lot d\'écharpes tricotées main', 'neuf', 'mariam.t', 'disponible',
    'Trois écharpes tricotées pendant la saison fraîche, bien utiles quand souffle l\'harmattan. Une par personne si possible.'],
  ['livres', 'Livres', 'Une quinzaine de romans', 'bon', 'awa_k', 'disponible',
    'Romans en français et en anglais, surtout des classiques. Le lot part en une seule fois.'],
  ['platine', 'Électronique', 'Platine vinyle avec cellule neuve', 'tres_bon', 'issouf_s', 'disponible',
    'Fonctionne parfaitement, cellule changée l\'an dernier. J\'aimerais l\'échanger contre une enceinte Bluetooth ou quelques vinyles.'],
  ['appareil', 'Électronique', 'Appareil photo argentique Minolta', 'bon', 'demo', 'reserve',
    'Boîtier et objectif 50 mm. La mécanique fonctionne, la cellule de mesure de lumière ne marche plus.'],
  ['arrosoir', 'Jardin', 'Arrosoir en zinc, 10 litres', 'use', 'mariam.t', 'disponible',
    'Quelques bosses mais aucune fuite. La pomme d\'arrosage est fournie.'],
  ['succulentes', 'Jardin', 'Boutures de succulentes en pots', 'neuf', 'awa_k', 'disponible',
    'J\'ai beaucoup trop de boutures : echeverias, crassulas et pothos. Venez avec un carton, je donne les pots.'],
  ['camion', 'Enfants', 'Camion en bois fait main', 'tres_bon', 'mariam.t', 'disponible',
    'Fabriqué par mon père. Bois brut non verni, les roues tournent bien. Convient dès 2 ans.'],
  ['velo', 'Sport', 'Vélo de ville rouge, taille M', 'bon', 'demo', 'disponible',
    'Freins révisés, pneus récents, il manque la sonnette. Pour une personne de 1,60 m à 1,75 m.'],
  ['raquette', 'Sport', 'Raquette de tennis et balles', 'bon', 'awa_k', 'disponible',
    'Raquette adulte, cordage encore correct. Avec une boîte de balles déjà entamée.'],
  ['penny', 'Sport', 'Penny board orange', 'bon', 'issouf_s', 'disponible',
    'Roulements graissés récemment, quelques rayures sous la planche.'],
  ['guitare', 'Autre', 'Guitare folk avec housse', 'use', 'awa_k', 'disponible',
    'Il manque une corde et le vernis est usé, mais le manche est droit. Parfaite pour débuter.'],
];

// [titre de l'annonce, auteur de l'avis, note, commentaire]
const REVIEWS = []; // avis retirés : ils portaient sur des objets donnés

// [titre de l'annonce, intéressé, [[expéditeur, message], …]]
const CONVERSATIONS = [
  ['Platine vinyle avec cellule neuve', 'demo', [
    ['demo', 'Bonjour ! J\'ai une enceinte Bluetooth JBL presque neuve, l\'échange vous intéresse ?'],
    ['issouf_s', 'Oui, avec plaisir. Je suis disponible samedi matin près du marché Rood Woko, ça vous va ?'],
  ]],
  ['Vélo de ville rouge, taille M', 'mariam.t', [
    ['mariam.t', 'Bonjour, le vélo est-il toujours disponible ? Ce serait pour aller au lycée.'],
  ]],
];

async function main() {
  const conn = await db.getConnection();
  try {
    const [legacy] = await conn.query(
      `SELECT p.filename FROM item_photos p JOIN items i ON i.id = p.item_id
         JOIN users u ON u.id = i.user_id WHERE u.email IN (?)`, [LEGACY_EMAILS]
    );
    await conn.query('DELETE FROM users WHERE email IN (?)', [LEGACY_EMAILS]);
    await Promise.all(legacy.map((p) => deletePhoto(p.filename)));

    const hash = await bcrypt.hash(PASSWORD, 12);
    const ids = {};
    const coords = {};
    for (const u of USERS) {
      coords[u.username] = await geocode(u.city);
      if (!coords[u.username]) console.warn(`Ville non géocodée (réseau ?) : ${u.city}`);
      const pos = coords[u.username] || {};
      const [r] = await conn.execute(
        `INSERT INTO users (username, email, password_hash, city, lat, lng) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), password_hash = VALUES(password_hash),
           city = VALUES(city), lat = VALUES(lat), lng = VALUES(lng)`,
        [u.username, u.email, hash, u.city, pos.lat ?? null, pos.lng ?? null]
      );
      ids[u.username] = r.insertId;
    }
    const userIds = Object.values(ids);

    // Nettoyage des anciennes annonces de démo (et de leurs fichiers)
    const marks = userIds.map(() => '?').join(',');
    const [old] = await conn.query(
      `SELECT p.filename FROM item_photos p JOIN items i ON i.id = p.item_id WHERE i.user_id IN (${marks})`, userIds
    );
    await conn.query(`DELETE FROM items WHERE user_id IN (${marks})`, userIds);
    await Promise.all(old.map((p) => deletePhoto(p.filename)));

    const [cats] = await conn.query('SELECT id, name FROM categories');
    const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));
    const cityOf = Object.fromEntries(USERS.map((u) => [u.username, u.city]));
    const itemIds = {};

    for (const [i, [photo, cat, title, condition, owner, status, description, givenTo]] of ITEMS.entries()) {
      const filename = crypto.randomUUID() + '.jpg';
      await fs.copyFile(path.join(PHOTOS_DIR, photo + '.jpg'), path.join(UPLOAD_DIR, filename));
      await processPhoto(filename);
      const pos = coords[owner] || {};
      // Dates étalées pour un ordre d'affichage naturel
      const [r] = await conn.execute(
        `INSERT INTO items (user_id, category_id, title, description, item_condition, city, status, lat, lng,
                            given_to_id, given_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? IS NULL, NULL, NOW() - INTERVAL ? DAY), NOW() - INTERVAL ? HOUR)`,
        [ids[owner], catId[cat], title, description, condition, cityOf[owner], status, pos.lat ?? null, pos.lng ?? null,
          givenTo ? ids[givenTo] : null, givenTo || null, i, i * 7 + 1]
      );
      await conn.execute('INSERT INTO item_photos (item_id, filename, position) VALUES (?, ?, 0)', [r.insertId, filename]);
      itemIds[title] = { id: r.insertId, owner };
      // Un objet donné l'a été à quelqu'un qui avait écrit au propriétaire
      if (givenTo) {
        CONVERSATIONS.push([title, givenTo, [[givenTo, 'Bonjour, je serais ravi(e) de le récupérer !'], [owner, 'Avec plaisir, il est à vous.']]]);
      }
    }

    for (const [title, buyer, messages] of CONVERSATIONS) {
      const item = itemIds[title];
      const [r] = await conn.execute(
        'INSERT INTO conversations (item_id, buyer_id, seller_id) VALUES (?, ?, ?)',
        [item.id, ids[buyer], ids[item.owner]]
      );
      for (const [j, [sender, content]] of messages.entries()) {
        await conn.execute(
          `INSERT INTO messages (conversation_id, sender_id, content, created_at)
           VALUES (?, ?, ?, NOW() - INTERVAL ? MINUTE)`,
          [r.insertId, ids[sender], content, (messages.length - j) * 25]
        );
      }
    }

    for (const [title, author, rating, comment] of REVIEWS) {
      const item = itemIds[title];
      const [[row]] = await conn.execute('SELECT user_id, given_to_id FROM items WHERE id = ?', [item.id]);
      const reviewee = ids[author] === row.user_id ? row.given_to_id : row.user_id;
      await conn.execute(
        'INSERT INTO reviews (item_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
        [item.id, ids[author], reviewee, rating, comment]
      );
    }

    console.log(`${ITEMS.length} annonces, ${CONVERSATIONS.length} conversations et ${REVIEWS.length} avis créés.`);
    console.log(`Comptes : ${USERS.map((u) => u.email).join(', ')} (mot de passe : ${PASSWORD})`);
  } finally {
    conn.release();
    await db.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
