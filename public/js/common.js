// Code partagé par toutes les pages : API, échappement, en-tête, cartes d'annonce, temps réel.

// Appels API : jeton CSRF ajouté automatiquement, renvoie le JSON ou lève une erreur lisible
let csrf = null;
async function csrfFetch() {
  csrf = (await (await fetch('/api/csrf', { credentials: 'same-origin' })).json()).token;
  return csrf;
}

async function api(url, options = {}, retried = false) {
  const opts = { credentials: 'same-origin', ...options };
  opts.headers = { ...opts.headers };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET') opts.headers['X-CSRF-Token'] = csrf || await csrfFetch();
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  // Session renouvelée (connexion, expiration) : on récupère un nouveau jeton et on réessaie une fois
  if (res.status === 403 && data.code === 'CSRF' && !retried) {
    await csrfFetch();
    return api(url, options, true);
  }
  if (!res.ok) throw new Error(data.error || 'Le serveur ne répond pas. Réessayez dans un instant.');
  return data;
}

// Échappe le HTML pour éviter les failles XSS
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function photoUrl(filename) {
  return filename ? `/uploads/${encodeURIComponent(filename)}` : '/img/placeholder.svg';
}

// Images responsives : variantes WebP 400 et 800 px générées à l'envoi
function photoSrcset(filename, sizes) {
  if (!filename) return '';
  const base = encodeURIComponent(filename.replace(/\.[^.]+$/, ''));
  return `srcset="/uploads/${base}-400.webp 400w, /uploads/${base}-800.webp 800w" sizes="${sizes}"`;
}
const SIZES = {
  card: '(max-width: 640px) 50vw, (max-width: 1180px) 33vw, 280px',
  detail: '(max-width: 900px) 100vw, 640px',
  thumb: '120px',
};

const STATUS_LABELS = { disponible: 'Disponible', reserve: 'Réservé', donne: 'Donné' };
const MODERATION_LABELS = { pending: 'En vérification', refused: 'Refusée' };
const CONDITION_LABELS = { neuf: 'Neuf', tres_bon: 'Très bon état', bon: 'Bon état', use: 'Usé' };

const ICONS = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4 7.4 4c2 0 3.6 1.1 4.6 2.7C13 5.1 14.6 4 16.6 4c3.5 0 5.8 3.6 4.6 7.1-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
  spark: '<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>',
};

// Note en étoiles, lisible par les lecteurs d'écran
function stars(rating) {
  const full = Math.round(rating);
  return `<span class="stars" role="img" aria-label="${String(rating).replace('.', ',')} sur 5">${
    [1, 2, 3, 4, 5].map((n) => `<span class="${n <= full ? 'on' : ''}">${ICONS.star}</span>`).join('')}</span>`;
}

// « il y a 3 h », « il y a 2 jours »…
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function timeAgo(date) {
  const seconds = (new Date(date) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, s] of units) {
    if (Math.abs(seconds) >= s) return rtf.format(Math.round(seconds / s), unit);
  }
  return 'à l\'instant';
}

function formatKm(km) {
  if (km == null) return '';
  return km < 1 ? 'à moins d\'1 km' : `à ${String(km).replace('.', ',')} km`;
}

// Carte d'annonce (accueil, favoris, profil)
function itemCard(item) {
  const label = item.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris';
  // Visible seulement par l'auteur : annonce en cours de vérification ou refusée par la modération
  const moderation = MODERATION_LABELS[item.moderation_status];
  const stamp = moderation || (item.status !== 'disponible' ? STATUS_LABELS[item.status] : '');
  return `
    <article class="card" data-status="${moderation ? 'moderation' : esc(item.status)}">
      <a class="card-link" href="/annonce.html?id=${item.id}">
        <div class="card-photo">
          <img src="${photoUrl(item.photo)}" ${photoSrcset(item.photo, SIZES.card)} alt="" width="400" height="300" loading="lazy" decoding="async">
          <span class="tag">${ICONS.pin}${esc(item.city)}</span>
          ${stamp ? `<span class="stamp">${stamp}</span>` : ''}
        </div>
        <h3 class="card-title">${esc(item.title)}</h3>
        <p class="card-meta">
          <span>${CONDITION_LABELS[item.item_condition] || ''}</span>
          ${item.created_at ? `<span>${timeAgo(item.created_at)}</span>` : ''}
        </p>
      </a>
      <button type="button" class="fav ${item.is_favorite ? 'active' : ''}" data-id="${item.id}"
              aria-label="${label} : ${esc(item.title)}" aria-pressed="${!!item.is_favorite}">${ICONS.heart}</button>
    </article>`;
}

let currentUser = null;

// L'assistant IA est-il activé sur le serveur ? (une seule requête par page)
let aiStatusPromise = null;
function aiEnabled() {
  aiStatusPromise ??= api('/api/ai/status').then((r) => r.enabled).catch(() => false);
  return aiStatusPromise;
}

// Pied de page : liens du compte selon la connexion
async function initFooter() {
  const account = document.querySelector('#footer-account');
  if (account && currentUser) {
    account.innerHTML = `
      <li><a href="/profil.html?u=${encodeURIComponent(currentUser.username)}">Mon profil</a></li>
      <li><a href="/messages.html">Messages</a></li>
      <li><a href="/?favoris=1">Favoris</a></li>`;
  }
}

async function initHeader() {
  currentUser = await api('/api/auth/me').catch(() => null);
  initFooter();
  const nav = document.querySelector('#nav');
  if (!nav) return currentUser;
  const here = location.pathname + location.search;
  const link = (href, text) => {
    const current = here === href || (!href.includes('?') && location.pathname === href);
    return `<a href="${href}" ${current ? 'aria-current="page"' : ''}>${text}</a>`;
  };

  if (currentUser) {
    const me = `/profil.html?u=${encodeURIComponent(currentUser.username)}`;
    nav.innerHTML = `
      ${link('/carte.html', 'Carte')}
      ${link('/?favoris=1', 'Favoris')}
      ${link('/messages.html', 'Messages<span id="unread"></span>')}
      ${link(me, 'Mon profil')}
      <button type="button" id="logout" class="link">Se déconnecter</button>
      <a href="/publier.html" class="btn btn-primary btn-small">Publier une annonce</a>`;
    nav.querySelector('#logout').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      location.href = '/';
    });
    refreshUnread();
    connectRealtime();
  } else {
    nav.innerHTML = `
      ${link('/carte.html', 'Carte')}
      <a href="/connexion.html">Se connecter</a>
      <a href="/connexion.html#inscription" class="btn btn-primary btn-small">Créer un compte</a>`;
  }
  return currentUser;
}

async function refreshUnread() {
  const slot = document.querySelector('#unread');
  if (!slot) return;
  const convs = await api('/api/conversations').catch(() => []);
  const n = convs.reduce((sum, c) => sum + Number(c.unread), 0);
  slot.innerHTML = n ? `<span class="count" aria-label="${n} non lu${n > 1 ? 's' : ''}">${n}</span>` : '';
}

async function toggleFavorite(itemId, button) {
  if (!currentUser) return (location.href = '/connexion.html');
  const isFav = button.classList.contains('active');
  await api(`/api/favorites/${itemId}`, { method: isFav ? 'DELETE' : 'POST' });
  button.classList.toggle('active');
  button.setAttribute('aria-pressed', String(!isFav));
  const label = button.getAttribute('aria-label');
  if (label) button.setAttribute('aria-label', label.replace(isFav ? 'Retirer des' : 'Ajouter aux', isFav ? 'Ajouter aux' : 'Retirer des'));
}

// Notifications discrètes en bas de l'écran
function toast(html, href) {
  let box = document.querySelector('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement(href ? 'a' : 'div');
  el.className = 'toast';
  if (href) el.href = href;
  el.innerHTML = html;
  box.append(el);
  setTimeout(() => el.classList.add('leaving'), 6000);
  setTimeout(() => el.remove(), 6600);
}

// Temps réel : les pages écoutent `realtime` (évènements « message », « typing », « review »)
const realtime = new EventTarget();
let socket = null;

function connectRealtime() {
  if (socket || !currentUser) return;
  const script = document.createElement('script');
  script.src = '/socket.io/socket.io.min.js';
  script.onload = () => {
    socket = window.io({ withCredentials: true });
    for (const name of ['message', 'typing', 'review', 'moderation']) {
      socket.on(name, (detail) => realtime.dispatchEvent(new CustomEvent(name, { detail })));
    }
  };
  document.head.append(script);
}

// Comportement par défaut, hors page Messages : badge + notification
realtime.addEventListener('message', ({ detail }) => {
  const { conversationId, message } = detail;
  if (message.sender_id === currentUser?.id) return;
  if (document.body.dataset.page === 'messages') return; // la page gère elle-même l'affichage
  refreshUnread();
  toast(`<strong>${esc(message.username)}</strong> à propos de « ${esc(message.item_title)} »<br>
         <span>${esc(message.content.slice(0, 90))}</span>`, `/messages.html?c=${conversationId}`);
});
realtime.addEventListener('review', ({ detail }) => {
  toast(`Nouvel avis reçu : ${detail.rating} étoile${detail.rating > 1 ? 's' : ''} pour « ${esc(detail.itemTitle)} »`,
    `/profil.html?u=${encodeURIComponent(currentUser.username)}`);
});

realtime.addEventListener('moderation', ({ detail }) => {
  if (document.body.dataset.page === 'annonce') return; // la fiche se met à jour elle-même
  toast(detail.status === 'approved'
    ? `Votre annonce « ${esc(detail.title)} » est en ligne.`
    : `Votre annonce « ${esc(detail.title)} » n'a pas été publiée : ${esc(detail.reason)}`, `/annonce.html?id=${detail.itemId}`);
});
