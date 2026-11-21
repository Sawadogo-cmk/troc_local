// Messagerie en temps réel : les nouveaux messages arrivent par Socket.IO, sans rechargement
let activeId = Number(new URLSearchParams(location.search).get('c')) || null;
let conversations = [];
const box = document.querySelector('#messages');
const typingEl = document.querySelector('#typing');

const bubble = (m) => `
  <div class="bubble ${m.sender_id === currentUser.id ? 'mine' : ''}">
    ${esc(m.content)}
    <time datetime="${esc(m.created_at)}">${new Date(m.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</time>
  </div>`;

async function loadList() {
  conversations = await api('/api/conversations');
  document.querySelector('#list').innerHTML = conversations.length
    ? conversations.map((c) => `
        <button type="button" class="conv" data-id="${c.id}" ${c.id === activeId ? 'aria-current="true"' : ''}>
          <img src="${photoUrl(c.item_photo)}" ${photoSrcset(c.item_photo, '52px')} alt="" width="52" height="52">
          <strong>${esc(c.other_user)}</strong>
          ${c.unread > 0 ? `<span class="count" aria-label="${c.unread} non lu${c.unread > 1 ? 's' : ''}">${c.unread}</span>` : '<span></span>'}
          <small>${esc(c.item_title)}</small>
          <span class="preview-text">${esc(c.last_message)}</span>
        </button>`).join('')
    : `<div class="empty"><p><strong>Aucune conversation pour l'instant.</strong></p>
         <p class="muted">Écrivez à quelqu'un depuis une annonce qui vous plaît.</p>
         <a class="btn" href="/">Voir les annonces</a></div>`;
  refreshUnread();
}

async function openConversation(id) {
  activeId = Number(id);
  history.replaceState(null, '', `?c=${activeId}`);
  const conv = conversations.find((c) => c.id === activeId);
  const header = document.querySelector('#thread-header');
  header.hidden = !conv;
  if (conv) header.innerHTML = `<a href="/profil.html?u=${encodeURIComponent(conv.other_user)}"><strong>${esc(conv.other_user)}</strong></a>,
    à propos de <a href="/annonce.html?id=${conv.item_id}">${esc(conv.item_title)}</a>`;
  const messages = await api(`/api/conversations/${activeId}/messages`); // marque aussi les messages comme lus
  box.innerHTML = messages.map(bubble).join('');
  box.scrollTop = box.scrollHeight;
  typingEl.hidden = true;
  document.querySelector('#reply').hidden = false;
  resetSuggestions();
  await loadList();
}

/* ---- Réponses suggérées par l'assistant IA (à la demande) ---- */
const suggestBox = document.querySelector('#suggest');
const suggestBtn = document.querySelector('#suggest-btn');
const suggestList = document.querySelector('#suggest-list');

let aiOn = false;

function resetSuggestions() {
  suggestBox.hidden = !aiOn || !activeId; // seulement quand une conversation est ouverte
  suggestList.innerHTML = '';
  suggestBtn.hidden = false;
  suggestBtn.disabled = false;
  suggestBtn.innerHTML = `${ICONS.spark}Suggérer des réponses`;
}

suggestBtn.addEventListener('click', async () => {
  suggestBtn.disabled = true;
  suggestBtn.innerHTML = `${ICONS.spark}L'assistant réfléchit…`;
  try {
    const { suggestions } = await api(`/api/ai/suggestions/${activeId}`, { method: 'POST' });
    suggestBtn.hidden = true;
    suggestList.innerHTML = suggestions.map((t) =>
      `<button type="button" class="suggestion" data-text="${esc(t)}">${esc(t)}</button>`).join('');
  } catch (err) {
    suggestBtn.disabled = false;
    suggestBtn.innerHTML = `${ICONS.spark}Réessayer`;
    toast(esc(err.message));
  }
});

// Un clic place la suggestion dans le champ : l'utilisateur la relit ou la complète avant d'envoyer
suggestList.addEventListener('click', (e) => {
  const btn = e.target.closest('.suggestion');
  if (!btn) return;
  input.value = btn.dataset.text;
  input.focus();
  const bracket = input.value.indexOf('[');
  if (bracket >= 0) input.setSelectionRange(bracket, input.value.indexOf(']', bracket) + 1);
});

document.querySelector('#list').addEventListener('click', (e) => {
  const btn = e.target.closest('.conv');
  if (btn) openConversation(btn.dataset.id);
});

const input = document.querySelector('#content');
document.querySelector('#reply').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = '';
  try {
    await api(`/api/conversations/${activeId}/messages`, { method: 'POST', body: { content: text } });
    // Le message s'affiche à la réception de l'évènement temps réel
  } catch (err) {
    input.value = text;
    toast(esc(err.message));
  }
});

// « est en train d'écrire… » : au plus un signal toutes les 2 secondes
let lastTyping = 0;
input.addEventListener('input', () => {
  if (!socket || !activeId || Date.now() - lastTyping < 2000) return;
  lastTyping = Date.now();
  socket.emit('typing', { conversationId: activeId });
});

let typingTimer;
realtime.addEventListener('typing', ({ detail }) => {
  if (detail.conversationId !== activeId) return;
  typingEl.textContent = `${detail.username} est en train d'écrire…`;
  typingEl.hidden = false;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { typingEl.hidden = true; }, 3500);
});

realtime.addEventListener('message', async ({ detail }) => {
  const { conversationId, message } = detail;
  if (conversationId === activeId) {
    typingEl.hidden = true;
    box.insertAdjacentHTML('beforeend', bubble(message));
    box.scrollTop = box.scrollHeight;
    resetSuggestions(); // la conversation a avancé : les anciennes suggestions ne sont plus valables
    if (message.sender_id !== currentUser.id) {
      await api(`/api/conversations/${activeId}/messages`); // marque comme lu
    }
  } else if (message.sender_id !== currentUser.id) {
    toast(`<strong>${esc(message.username)}</strong> : ${esc(message.content.slice(0, 90))}`, `/messages.html?c=${conversationId}`);
  }
  loadList();
});

(async () => {
  const user = await initHeader();
  if (!user) return (location.href = '/connexion.html');
  aiEnabled().then((on) => { aiOn = on; resetSuggestions(); });
  await loadList();
  if (activeId) openConversation(activeId);
})();
