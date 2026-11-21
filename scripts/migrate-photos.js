// Génère les variantes 400/800 px (srcset) et retire les métadonnées des photos envoyées avant la V2.
// Relançable sans risque : les photos déjà traitées sont ignorées.
//   npm run photos:migrate
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { UPLOAD_DIR, processPhoto, WIDTHS, variantName } = require('../src/images');

(async () => {
  const [rows] = await db.query('SELECT DISTINCT filename FROM item_photos');
  let done = 0, skipped = 0, failed = 0;
  for (const { filename } of rows) {
    const original = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(original)) { failed++; console.warn('fichier manquant :', filename); continue; }
    const complete = WIDTHS.every((w) => fs.existsSync(path.join(UPLOAD_DIR, variantName(filename, w))));
    if (complete) { skipped++; continue; }
    try {
      await processPhoto(filename);
      done++;
    } catch (err) {
      failed++;
      console.warn('échec', filename, err.message);
    }
  }
  console.log(`Photos traitées : ${done}, déjà à jour : ${skipped}, en échec : ${failed}`);
  await db.end();
})();
