// Carte des annonces (Leaflet + OpenStreetMap) avec filtre de distance
/* global L */
const listEl = document.querySelector('#map-list');
const countEl = document.querySelector('#map-count');
const form = document.querySelector('#map-form');
const DEFAULT_CENTER = { lat: 12.3682, lng: -1.5271 }; // Ouagadougou

const map = L.map('map', { scrollWheelZoom: true, zoomControl: true }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
}).addTo(map);

const markers = L.layerGroup().addTo(map);
let centerMarker = null;
let radiusCircle = null;
let center = null;          // { lat, lng, label }
const byId = new Map();     // id -> marker

// Les annonces sont placées au centre de leur commune : on les écarte légèrement
// (de façon stable) pour qu'elles ne se superposent pas, sans jamais révéler d'adresse.
function spread(item) {
  const angle = item.id * 2.399963; // angle d'or
  const r = 0.004 + (item.id % 7) * 0.0017;
  return [item.lat + r * Math.sin(angle), item.lng + r * Math.cos(angle) * 1.4];
}

function pinIcon(item) {
  return L.divIcon({
    className: 'map-pin',
    html: `<img src="${photoUrl(item.photo)}" ${photoSrcset(item.photo, '48px')} alt="" width="44" height="44">`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
    popupAnchor: [0, -24],
  });
}

function popup(item) {
  return `<a class="map-popup" href="/annonce.html?id=${item.id}">
    <img src="${photoUrl(item.photo)}" ${photoSrcset(item.photo, '220px')} alt="" width="220" height="150">
    <strong>${esc(item.title)}</strong>
    <span>${esc(item.city)}${item.distance_km != null ? `, ${formatKm(item.distance_km)}` : ''}</span>
  </a>`;
}

function listRow(item) {
  return `<li><button type="button" class="map-row" data-id="${item.id}">
    <img src="${photoUrl(item.photo)}" ${photoSrcset(item.photo, '64px')} alt="" width="64" height="64" loading="lazy">
    <span><strong>${esc(item.title)}</strong>
    <span class="muted">${esc(item.city)}${item.distance_km != null ? `, ${formatKm(item.distance_km)}` : ''}</span></span>
  </button></li>`;
}

async function load() {
  const data = new FormData(form);
  const query = new URLSearchParams();
  if (center) {
    query.set('lat', center.lat);
    query.set('lng', center.lng);
    query.set('radius', data.get('radius'));
  }
  if (data.get('category')) query.set('category', data.get('category'));
  let items;
  try {
    items = await api('/api/items/map?' + query);
  } catch (err) {
    listEl.innerHTML = `<li class="error" role="alert">${esc(err.message)}</li>`;
    return;
  }

  markers.clearLayers();
  byId.clear();
  for (const item of items) {
    const m = L.marker(spread(item), { icon: pinIcon(item), title: item.title, alt: item.title })
      .bindPopup(popup(item), { maxWidth: 240, minWidth: 220 });
    markers.addLayer(m);
    byId.set(String(item.id), m);
  }

  if (radiusCircle) radiusCircle.remove();
  radiusCircle = null;
  if (center && Number(data.get('radius')) < 1000) {
    radiusCircle = L.circle([center.lat, center.lng], {
      radius: Number(data.get('radius')) * 1000, color: '#1f4d3a', weight: 2, fillColor: '#1f4d3a', fillOpacity: 0.06,
      interactive: false,
    }).addTo(map);
    map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
  } else if (items.length) {
    map.fitBounds(L.latLngBounds(items.map(spread)), { padding: [40, 40], maxZoom: 13 });
  }

  const radius = Number(data.get('radius'));
  const where = !center ? '' : radius >= 1000 ? ' dans tout le pays' : ` à moins de ${radius} km de ${esc(center.label)}`;
  countEl.innerHTML = items.length
    ? `<strong>${items.length} objet${items.length > 1 ? 's' : ''}</strong>${where}`
    : `Aucun objet${where}. Élargissez le rayon ou essayez une autre ville.`;
  listEl.innerHTML = items.map(listRow).join('');
}

function setCenter(lat, lng, label) {
  center = { lat, lng, label };
  if (centerMarker) centerMarker.remove();
  centerMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: 'map-me', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
    title: label, interactive: false, keyboard: false,
  }).addTo(map);
  load();
}

listEl.addEventListener('click', (e) => {
  const row = e.target.closest('.map-row');
  const marker = row && byId.get(row.dataset.id);
  if (!marker) return;
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14));
  marker.openPopup();
});

document.querySelector('#locate').addEventListener('click', () => {
  const status = document.querySelector('#map-status');
  if (!navigator.geolocation) return (status.textContent = 'Votre navigateur ne permet pas la géolocalisation.');
  status.textContent = 'Recherche de votre position…';
  navigator.geolocation.getCurrentPosition(
    (pos) => { status.textContent = ''; setCenter(pos.coords.latitude, pos.coords.longitude, 'votre position'); },
    () => { status.textContent = 'Position refusée ou indisponible. Indiquez plutôt une ville.'; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const city = form.city.value.trim();
  const status = document.querySelector('#map-status');
  if (!city) return load();
  try {
    const pos = await api('/api/items/geocode?city=' + encodeURIComponent(city));
    status.textContent = '';
    setCenter(pos.lat, pos.lng, city);
  } catch (err) { status.textContent = err.message; }
});
form.radius.addEventListener('change', () => load());
form.category.addEventListener('change', () => load());

(async () => {
  const user = await initHeader();
  const cats = await api('/api/categories').catch(() => []);
  form.category.innerHTML += cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (user?.lat != null) {
    form.city.value = user.city;
    setCenter(Number(user.lat), Number(user.lng), user.city);
  } else {
    load();
  }
})();
