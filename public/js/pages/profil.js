// Profil public : impact, badges, annonces et avis reçus
const username = new URLSearchParams(location.search).get('u');
const content = document.querySelector('#content');

const BADGE_ICONS = {
  'premier-don': '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>',
  genereux: '<path d="M4 12h3l3 7 4-14 3 7h3"/>',
  pilier: '<path d="M12 3l8 4v2H4V7zM6 10v7M10 10v7M14 10v7M18 10v7M4 20h16"/>',
  chineur: '<path d="M10.5 18a7.5 7.5 0 1 1 5.3-2.2L21 21"/>',
  fiable: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/>',
  ancien: '<path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/>',
};

function badge(b) {
  return `<li class="badge" title="${esc(b.hint)}">
    <svg viewBox="0 0 24 24" aria-hidden="true">${BADGE_ICONS[b.id] || ''}</svg>${esc(b.label)}</li>`;
}

function review(r) {
  return `<li class="review">
    <div class="review-head">${stars(r.rating)}<span class="muted">${timeAgo(r.created_at)}</span></div>
    ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
    <p class="muted review-meta"><a href="/profil.html?u=${encodeURIComponent(r.reviewer)}">${esc(r.reviewer)}</a>,
      ${r.reviewer_was_giver ? 'qui a donné' : 'qui a reçu'} « ${esc(r.item_title)} »</p>
  </li>`;
}

function render(p) {
  document.title = `${p.username} · Troc Local`;
  const s = p.stats;
  const since = new Date(p.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  content.innerHTML = `
    <section class="profile-head">
      <span class="avatar avatar-lg" aria-hidden="true">${esc(p.username.charAt(0))}</span>
      <div>
        <h1>${esc(p.username)}</h1>
        <p class="muted">${esc(p.city)}, membre depuis ${since}</p>
        ${s.rating != null ? `<p class="rating-line">${stars(s.rating)} <strong>${String(s.rating).replace('.', ',')}</strong>
          <span class="muted">(${s.reviews} avis)</span></p>` : '<p class="muted">Pas encore d\'avis</p>'}
      </div>
    </section>

    <section class="impact-strip" aria-label="Impact">
      <p><strong>${s.given}</strong> objet${s.given > 1 ? 's' : ''} donné${s.given > 1 ? 's' : ''}</p>
      <p><strong>${s.received}</strong> récupéré${s.received > 1 ? 's' : ''}</p>
      <p><strong>${String(s.kg).replace('.', ',')} kg</strong> sauvés de la benne</p>
    </section>

    ${p.badges.length ? `<ul class="badges" aria-label="Badges">${p.badges.map(badge).join('')}</ul>` : ''}

    <section class="profile-section">
      <h2>${p.is_me ? 'Mes annonces' : 'Ses annonces'}</h2>
      <div class="grid ${p.is_me ? 'own' : ''}" id="grid">
        ${p.items.length ? p.items.map(itemCard).join('') : `<div class="empty"><p>${p.is_me
          ? 'Vous n\'avez rien publié pour l\'instant.</p><a class="btn btn-primary" href="/publier.html">Publier une annonce</a>'
          : 'Aucune annonce en ce moment.</p>'}</div>`}
      </div>
    </section>

    <section class="profile-section">
      <h2>Avis reçus</h2>
      ${p.reviews.length ? `<ul class="reviews">${p.reviews.map(review).join('')}</ul>`
        : '<p class="muted">Les avis apparaissent ici après un don, laissés par la personne qui a donné ou reçu l\'objet.</p>'}
    </section>`;

  content.querySelector('#grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.fav');
    if (btn) toggleFavorite(btn.dataset.id, btn);
  });
}

(async () => {
  await initHeader();
  try { render(await api(`/api/users/${encodeURIComponent(username || '')}`)); }
  catch (err) {
    content.innerHTML = `<div class="empty"><p><strong>${esc(err.message)}</strong></p>
      <a class="btn" href="/">Voir les annonces</a></div>`;
  }
})();
