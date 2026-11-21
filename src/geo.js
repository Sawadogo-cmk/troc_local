// Géocodage d'une ville ou d'un quartier avec Nominatim (OpenStreetMap), valable dans le monde entier.
// Le pays est fixé par GEO_COUNTRY dans .env (code ISO à 2 lettres, « bf » pour le Burkina Faso).
// On ne stocke que le centre de la localité : jamais d'adresse précise.
//
// Règles d'usage de Nominatim respectées : 1 requête par seconde maximum, User-Agent
// identifiant l'application, résultats mis en cache.
const cache = new Map();
const COUNTRY = (process.env.GEO_COUNTRY || 'bf').toLowerCase();
const USER_AGENT = 'TrocLocal/1.0 (application de don et de troc entre voisins)';

let queue = Promise.resolve();
let lastCall = 0;

// Sérialise les appels et garantit au moins 1,1 s entre deux requêtes
function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

async function geocode(place) {
  const key = String(place || '').trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({ q: key, format: 'jsonv2', limit: '1', 'accept-language': 'fr' });
  if (COUNTRY) params.set('countrycodes', COUNTRY);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await throttled(() => fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000),
      }));
      if (!res.ok) continue;
      const [hit] = await res.json();
      const result = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
      cache.set(key, result);
      return result;
    } catch { /* réseau lent : on retente une fois */ }
  }
  return null; // l'annonce est quand même publiée, elle n'apparaîtra simplement pas sur la carte
}

// Distance en km entre deux points (formule de haversine), en SQL
const DISTANCE_SQL = `(6371 * 2 * ASIN(SQRT(
  POW(SIN(RADIANS(i.lat - ?) / 2), 2) +
  COS(RADIANS(?)) * COS(RADIANS(i.lat)) * POW(SIN(RADIANS(i.lng - ?) / 2), 2))))`;

module.exports = { geocode, DISTANCE_SQL };
