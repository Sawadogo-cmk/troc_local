// Accueil : recherche, catégories, grille, favoris, « mes annonces », compteur d'impact
const params = new URLSearchParams(location.search);
const mode = params.get('favoris') ? 'favoris' : params.get('mine') ? 'mine' : 'all';
const form = document.querySelector('#search');
const grid = document.querySelector('#grid');
const chips = document.querySelector('#chips');
let category = '';

function emptyState() {
  if (mode === 'favoris') return `<div class="empty"><p><strong>Vous n'avez pas encore de favoris.</strong></p>
    <p class="muted">Touchez le cœur sur une annonce pour la retrouver ici.</p>
    <a class="btn" href="/">Voir les annonces</a></div>`;
  if (mode === 'mine') return `<div class="empty"><p><strong>Vous n'avez rien publié pour l'instant.</strong></p>
    <p class="muted">Une photo, un titre et votre ville suffisent.</p>
    <a class="btn btn-primary" href="/publier.html">Publier une annonce</a></div>`;
  return `<div class="empty"><p><strong>Aucun objet ne correspond à cette recherche.</strong></p>
    <p class="muted">Essayez un autre mot, une ville voisine ou une autre catégorie.</p></div>`;
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

async function load(page = 1) {
  grid.setAttribute('aria-busy', 'true');
  let items, pages = 1, total;
  try {
    if (mode === 'favoris') {
      items = await api('/api/favorites');
      total = items.length;
    } else {
      const query = new URLSearchParams(new FormData(form));
      if (category) query.set('category', category);
      query.set('page', page);
      if (mode === 'mine') query.set('mine', 1);
      ({ items, pages, total } = await api('/api/items?' + query));
    }
  } catch (err) {
    grid.innerHTML = `<p class="error" role="alert">${esc(err.message)}</p>`;
    return;
  } finally {
    grid.removeAttribute('aria-busy');
  }
  grid.innerHTML = items.length ? items.map(itemCard).join('') : emptyState();
  document.querySelector('#results-count').textContent = total ? plural(total, 'objet') : '';
  document.querySelector('#pagination').innerHTML = pages > 1
    ? Array.from({ length: pages }, (_, i) => `<button type="button" data-page="${i + 1}"
        aria-label="Page ${i + 1}" ${i + 1 === page ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('')
    : '';
  return items;
}

function fillCollage(items) {
  const picks = items.filter((i) => i.photo && i.status === 'disponible').slice(0, 3);
  document.querySelector('#collage').innerHTML = picks.map((i) => `
    <figure><img src="${photoUrl(i.photo)}" ${photoSrcset(i.photo, '300px')} alt="" width="300" height="300">
    <figcaption>${esc(i.title)}</figcaption></figure>`).join('');
}

async function showImpact() {
  const { given, kg } = await api('/api/stats').catch(() => ({}));
  if (!given) return;
  document.querySelector('#impact').innerHTML =
    `Déjà <strong>${given} objet${given > 1 ? 's' : ''}</strong> passé${given > 1 ? 's' : ''} de main en main,
     soit environ <strong>${kg} kg</strong> qui n'ont pas fini à la benne.`;
}

grid.addEventListener('click', (e) => {
  const btn = e.target.closest('.fav');
  if (btn) toggleFavorite(btn.dataset.id, btn);
});
document.querySelector('#pagination').addEventListener('click', (e) => {
  const page = e.target.closest('[data-page]')?.dataset.page;
  if (page) { load(Number(page)); document.querySelector('.results-head').scrollIntoView(); }
});
function selectChip(id) {
  category = id ? String(id) : '';
  let label = 'Dernières annonces';
  chips.querySelectorAll('.chip').forEach((c) => {
    const on = c.dataset.id === category;
    c.setAttribute('aria-pressed', String(on));
    if (on && category) label = c.textContent;
  });
  document.querySelector('#results-title').textContent = label;
}

chips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  selectChip(chip.dataset.id);
  load(1);
});

/* ---- Recherche en langage naturel (assistant IA) ---- */
let useAi = false;
const aiNote = document.querySelector('#ai-note');

// Une phrase de 3 mots ou plus sans ville saisie : on laisse l'assistant interpréter
const looksLikeSentence = (text) => text.split(/\s+/).filter(Boolean).length >= 3 && !form.city.value.trim();

async function askAssistant(text) {
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'L’assistant réfléchit…';
  try {
    const r = await api('/api/ai/search', { method: 'POST', body: { query: text } });
    form.q.value = r.keywords;
    form.city.value = r.city;
    selectChip(r.category_id);
    aiNote.innerHTML = `${ICONS.spark}<span><strong>L'assistant a compris :</strong> ${esc(r.summary)}</span>
      <button type="button" class="link" id="ai-undo">Chercher le texte exact</button>`;
    aiNote.hidden = false;
    aiNote.querySelector('#ai-undo').addEventListener('click', () => {
      form.q.value = text;
      form.city.value = '';
      selectChip('');
      aiNote.hidden = true;
      runSearch(false);
    });
  } catch (err) {
    aiNote.innerHTML = `<span>${esc(err.message)}</span>`;
    aiNote.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Chercher';
  }
}

async function runSearch(allowAi = true) {
  const text = form.q.value.trim();
  if (allowAi && useAi && looksLikeSentence(text)) {
    await askAssistant(text);
  } else if (allowAi) {
    aiNote.hidden = true;
  }
  if (!category) {
    const filtered = form.q.value.trim() || form.city.value.trim();
    document.querySelector('#results-title').textContent = filtered ? 'Résultats' : 'Dernières annonces';
  }
  await load(1);
  document.querySelector('.results-head').scrollIntoView({ behavior: 'smooth' });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch();
});

aiEnabled().then((on) => {
  useAi = on;
  if (!on) return;
  form.q.placeholder = 'Décrivez ce que vous cherchez…';
  const hint = document.querySelector('#ai-hint');
  hint.innerHTML = `${ICONS.spark}Écrivez comme vous parlez, par exemple « un vélo pour aller au lycée à Ouaga » : l'assistant s'occupe des filtres.`;
  hint.hidden = false;
});

(async () => {
  await initHeader();
  if (mode !== 'all') {
    const title = mode === 'favoris' ? 'Mes favoris' : 'Mes annonces';
    document.title = `${title} · Troc Local`;
    document.querySelector('#hero').hidden = true;
    document.querySelector('#page-head').hidden = false;
    document.querySelector('#page-title').textContent = title;
    document.querySelector('.results-head').hidden = true;
    chips.hidden = true;
    if (mode === 'mine') grid.classList.add('own');
    return load();
  }
  showImpact();
  const cats = await api('/api/categories').catch(() => []);
  chips.innerHTML = `<button type="button" class="chip" data-id="" aria-pressed="true">Tout</button>` +
    cats.map((c) => `<button type="button" class="chip" data-id="${c.id}" aria-pressed="false">${esc(c.name)}</button>`).join('');
  const items = await load();
  if (items) fillCollage(items);
})();
