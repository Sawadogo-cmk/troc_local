// Traitement des photos envoyées :
// - réenregistre l'original sans métadonnées (les photos de téléphone contiennent souvent la position GPS)
// - crée deux variantes WebP (400 et 800 px de large) utilisées par srcset
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const WIDTHS = [400, 800];

const baseName = (filename) => filename.replace(/\.[^.]+$/, '');
const variantName = (filename, width) => `${baseName(filename)}-${width}.webp`;

async function processPhoto(filename) {
  const file = path.join(UPLOAD_DIR, filename);
  const input = await fs.readFile(file);
  // .rotate() applique l'orientation EXIF avant de la supprimer ; sharp ne recopie aucune métadonnée par défaut
  const image = sharp(input).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
  await fs.writeFile(file, await image.clone().toBuffer());
  await Promise.all(WIDTHS.map((w) =>
    sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 })
      .toFile(path.join(UPLOAD_DIR, variantName(filename, w)))));
}

async function deletePhoto(filename) {
  const files = [filename, ...WIDTHS.map((w) => variantName(filename, w))];
  await Promise.all(files.map((f) => fs.unlink(path.join(UPLOAD_DIR, f)).catch(() => {})));
}

module.exports = { UPLOAD_DIR, WIDTHS, processPhoto, deletePhoto, variantName };
