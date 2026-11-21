// Fiche annonce : galerie, contact, gestion du statut, avis après un don
const id = new URLSearchParams(location.search).get('id');
const content = document.querySelector('#content');
const profileLink = (username) => `/profil.html?u=${encodeURIComponent(username)}`;

function contactBlock(item) {
  if (item.status === 'donne') {
    return `<p class="panel status-note">Cet objet a déjà trouvé preneur${item.given_to_username
      ? ` : il a été donné à <a href="${profileLink(item.given_to_username)}">${esc(item.given_to_username)}</a>` : ''}.</p>`;
  }
  if (!currentUser) {
    return `<div class="panel"><p>Connectez-vous pour écrire à ${esc(item.username)}.</p>
      <p class="spaced"><a class="btn btn-primary" href="/connexion.html">Se connecter</a></p></div>`;
  }
  return `
    <form id="contact" class="contact panel">
      <label for="msg">Écrire à ${esc(item.username)}</label>
      <textarea id="msg" name="msg" required rows="3">Bonjour, votre objet m'intéresse. Est-il toujours disponible ?</textarea>
      <p id="contact-error" class="error" role="alert"></p>
      <button type="submit" class="btn btn-primary">Envoyer le message</button>
    </form>`;
}

function ownerBlock(item) {
  return `
    <form id="owner-form" class="panel owner-actions">
      <label>Statut de l'annonce
        <select id="status" name="status">
          ${Object.entries(STATUS_LABELS).map(([k, v]) =>
            `<option value="${k}" ${k === item.status ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label id="given-to-field" ${item.status === 'donne' ? '' : 'hidden'}>Donné à
        <select id="given-to" name="given_to_id"><option value="">Quelqu'un hors du site</option></select>
      </label>
      <div class="owner-buttons">
        <button type="submit" class="btn btn-primary">Enregistrer</button>
        <button type="button" class="btn btn-danger" id="delete">Supprimer l'annonce</button>
      </div>
      <p id="owner-msg" class="muted status-note" role="status"></p>
    </form>`;
}

function reviewBlock(item) {
  if (!item.can_review) return '';
  const other = currentUser.id === item.user_id ? item.given_to_username : item.username;
  return `
    <form id="review" class="panel review-form">
      <fieldset>
        <legend>Comment s'est passé l'échange avec ${esc(other)} ?</legend>
        <div class="star-input">
          ${[5, 4, 3, 2, 1].map((n) => `
            <input type="radio" name="rating" id="star-${n}" value="${n}" required>
            <label for="star-${n}" title="${n} étoile${n > 1 ? 's' : ''}">${ICONS.star}<span class="visually-hidden">${n} étoile${n > 1 ? 's' : ''}</span></label>`).join('')}
        </div>
      </fieldset>
      <label for="review-comment">Un mot pour les autres membres <span class="hint">facultatif</span></label>
      <textarea id="review-comment" name="comment" rows="2" maxlength="500"></textarea>
      <p id="review-error" class="error" role="alert"></p>
      <button type="submit" class="btn btn-primary">Publier l'avis</button>
    </form>`;
}

// Bandeau réservé à l'auteur : vérification automatique en cours ou annonce refusée
function moderationBanner(item) {
  if (item.moderation_status === 'pending') {
    return `<div class="moderation-banner pending" role="status">${ICONS.spark}
      <p><strong>Vérification automatique en cours.</strong> Votre annonce sera visible par tous dans quelques secondes.</p></div>`;
  }
  if (item.moderation_status === 'refused') {
    return `<div class="moderation-banner refused" role="alert">
      <p><strong>Annonce non publiée.</strong> ${esc(item.moderation_reason || '')}</p>
      <p class="muted">Supprimez-la puis publiez une version corrigée.</p></div>`;
  }
  return '';
}

function render(item) {
  const isOwner = currentUser && currentUser.id === item.user_id;
  const photos = item.photos.length ? item.photos : [null];
  document.title = `${item.title} · Troc Local`;
  content.innerHTML = `
    <div class="detail">
      <div class="gallery">
        <img id="main-photo" src="${photoUrl(photos[0])}" ${photoSrcset(photos[0], SIZES.detail)}
             alt="${esc(item.title)}" width="800" height="640">
        ${photos.length > 1 ? `<div class="thumbs">${photos.map((p, i) =>
          `<button type="button" data-photo="${esc(p)}" aria-pressed="${i === 0}" aria-label="Photo ${i + 1}">
             <img src="${photoUrl(p)}" ${photoSrcset(p, SIZES.thumb)} alt="" width="72" height="72"></button>`).join('')}</div>` : ''}
      </div>
      <div class="info">
        ${isOwner ? moderationBanner(item) : ''}
        <span class="tag">${ICONS.pin}${esc(item.city)}</span>
        <h1>${esc(item.title)}</h1>
        <dl class="facts">
          <dt>Disponibilité</dt><dd>${STATUS_LABELS[item.status]}</dd>
          <dt>État</dt><dd>${CONDITION_LABELS[item.item_condition]}</dd>
          <dt>Catégorie</dt><dd>${esc(item.category)}</dd>
          <dt>Publiée</dt><dd><time datetime="${esc(item.created_at)}">${timeAgo(item.created_at)}</time></dd>
        </dl>
        <a class="owner" href="${profileLink(item.username)}">
          <span class="avatar" aria-hidden="true">${esc(item.username.charAt(0))}</span>
          <span>Proposé par <strong>${esc(item.username)}</strong><br><span class="muted">Voir son profil et ses avis</span></span>
        </a>
        <p class="description">${esc(item.description).replace(/\n/g, '<br>')}</p>
        <div class="actions">
          <button type="button" class="btn fav-inline ${item.is_favorite ? 'active' : ''}" id="fav"
                  aria-pressed="${!!item.is_favorite}">${ICONS.heart}Favori</button>
          ${reviewBlock(item)}
          ${isOwner ? ownerBlock(item) : contactBlock(item)}
        </div>
      </div>
    </div>`;
  bind(item, isOwner);
}

function bind(item, isOwner) {
  content.querySelector('.thumbs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-photo]');
    if (!btn) return;
    const img = content.querySelector('#main-photo');
    img.outerHTML = `<img id="main-photo" src="${photoUrl(btn.dataset.photo)}" ${photoSrcset(btn.dataset.photo, SIZES.detail)}
      alt="${esc(item.title)}" width="800" height="640">`;
    content.querySelectorAll('.thumbs button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });
  content.querySelector('#fav').addEventListener('click', (e) => toggleFavorite(item.id, e.currentTarget));

  if (isOwner) {
    const status = content.querySelector('#status');
    const field = content.querySelector('#given-to-field');
    const select = content.querySelector('#given-to');
    api(`/api/items/${item.id}/candidates`).then((people) => {
      select.innerHTML += people.map((p) =>
        `<option value="${p.id}" ${p.id === item.given_to_id ? 'selected' : ''}>${esc(p.username)}</option>`).join('');
    }).catch(() => {});
    status.addEventListener('change', () => { field.hidden = status.value !== 'donne'; });
    content.querySelector('#owner-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = content.querySelector('#owner-msg');
      try {
        await api(`/api/items/${item.id}/status`, {
          method: 'PATCH', body: { status: status.value, given_to_id: select.value || null },
        });
        msg.textContent = `Statut enregistré : ${STATUS_LABELS[status.value]}.`;
        render(await api(`/api/items/${item.id}`)); // affiche le formulaire d'avis si l'objet vient d'être donné
        content.querySelector('#owner-msg').textContent = `Statut enregistré : ${STATUS_LABELS[status.value]}.`;
      } catch (err) { msg.textContent = err.message; }
    });
    content.querySelector('#delete').addEventListener('click', async () => {
      if (!confirm(`Supprimer définitivement « ${item.title} » ?`)) return;
      await api(`/api/items/${item.id}`, { method: 'DELETE' });
      location.href = `/profil.html?u=${encodeURIComponent(currentUser.username)}`;
    });
  }

  content.querySelector('#contact')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { id: convId } = await api('/api/conversations', {
        method: 'POST', body: { itemId: item.id, content: e.target.msg.value },
      });
      location.href = `/messages.html?c=${convId}`;
    } catch (err) { content.querySelector('#contact-error').textContent = err.message; }
  });

  content.querySelector('#review')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      await api('/api/reviews', {
        method: 'POST', body: { itemId: item.id, rating: Number(data.get('rating')), comment: data.get('comment') },
      });
      e.target.outerHTML = '<p class="panel status-note" role="status">Merci, votre avis est publié sur le profil de l\'autre membre.</p>';
    } catch (err) { content.querySelector('#review-error').textContent = err.message; }
  });
}

// Résultat de la modération reçu en temps réel
realtime.addEventListener('moderation', async ({ detail }) => {
  if (String(detail.itemId) !== String(id)) return;
  render(await api(`/api/items/${encodeURIComponent(id)}`));
  if (detail.status === 'approved') toast('Votre annonce est en ligne.');
});

(async () => {
  await initHeader();
  try {
    const item = await api(`/api/items/${encodeURIComponent(id)}`);
    render(item);
    // Filet de sécurité si le résultat est arrivé avant la connexion temps réel
    if (item.moderation_status === 'pending') {
      let tries = 0;
      const timer = setInterval(async () => {
        const fresh = await api(`/api/items/${encodeURIComponent(id)}`).catch(() => null);
        if (++tries >= 12 || (fresh && fresh.moderation_status !== 'pending')) clearInterval(timer);
        if (fresh && fresh.moderation_status !== 'pending') render(fresh);
      }, 5000);
    }
  }
  catch (err) {
    content.innerHTML = `<div class="empty"><p><strong>${esc(err.message)}</strong></p>
      <p class="muted">L'annonce a peut-être été supprimée par son auteur.</p>
      <a class="btn" href="/">Voir les autres annonces</a></div>`;
  }
})();
