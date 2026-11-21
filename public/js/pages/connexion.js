// Connexion / inscription : onglets accessibles au clavier
const tabs = [...document.querySelectorAll('[role="tab"]')];

function selectTab(tab, focus = true) {
  tabs.forEach((t) => {
    const active = t === tab;
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
  });
  document.querySelector('#error').textContent = '';
  if (focus) tab.focus();
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') selectTab(tabs[(i + 1) % tabs.length]);
  });
});
if (location.hash === '#inscription') selectTab(tabs[1], false);

for (const id of ['login', 'register']) {
  document.querySelector('#' + id).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/auth/${id}`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      location.href = '/';
    } catch (err) {
      document.querySelector('#error').textContent = err.message;
    }
  });
}
