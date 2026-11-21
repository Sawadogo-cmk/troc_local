// Publication d'une annonce avec aperçu des photos
const form = document.querySelector('#form');
const error = document.querySelector('#error');

form.photos.addEventListener('change', () => {
  const files = [...form.photos.files];
  error.textContent = files.length > 5 ? '5 photos maximum : retirez-en quelques-unes.' : '';
  document.querySelector('#preview').innerHTML = files.slice(0, 5)
    .map((f) => `<img src="${URL.createObjectURL(f)}" alt="" width="88" height="88">`).join('');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (form.photos.files.length > 5) {
    return (error.textContent = '5 photos maximum : retirez-en quelques-unes.');
  }
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Publication…';
  try {
    const { id } = await api('/api/items', { method: 'POST', body: new FormData(form) });
    location.href = `/annonce.html?id=${id}`;
  } catch (err) {
    error.textContent = err.message;
    button.disabled = false;
    button.textContent = 'Publier l\'annonce';
  }
});

(async () => {
  const user = await initHeader();
  if (!user) return (location.href = '/connexion.html');
  form.city.value = user.city;
  const cats = await api('/api/categories');
  form.category_id.innerHTML = cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
})();
