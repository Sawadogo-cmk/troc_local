// Messagerie en temps réel avec Socket.IO.
// Chaque utilisateur connecté rejoint la salle « user:<id> » ; le serveur y pousse ses nouveaux messages.
const { Server } = require('socket.io');
const db = require('./db');

let io = null;

async function participants(conversationId) {
  const [rows] = await db.execute(
    'SELECT buyer_id, seller_id FROM conversations WHERE id = ?', [conversationId]
  );
  return rows[0] ? [rows[0].buyer_id, rows[0].seller_id] : null;
}

function init(server, sessionMiddleware) {
  io = new Server(server, { serveClient: true });
  io.engine.use(sessionMiddleware); // même session que l'API : pas de jeton supplémentaire

  io.use((socket, next) => {
    const userId = socket.request.session?.userId;
    if (!userId) return next(new Error('Connexion requise'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);
    const [[user]] = await db.execute('SELECT username FROM users WHERE id = ?', [userId]);
    socket.data.username = user?.username;

    // « est en train d'écrire… » : relayé uniquement à l'autre participant de la conversation
    socket.on('typing', async ({ conversationId } = {}) => {
      try {
        const ids = await participants(Number(conversationId));
        if (!ids || !ids.includes(userId)) return;
        const other = ids.find((id) => id !== userId);
        socket.to(`user:${other}`).emit('typing', { conversationId: Number(conversationId), username: socket.data.username });
      } catch { /* on ignore : l'indicateur n'est pas critique */ }
    });
  });
  return io;
}

// Envoie un évènement à un ou plusieurs utilisateurs (tous leurs onglets ouverts)
function notify(userIds, event, payload) {
  if (!io) return;
  for (const id of [].concat(userIds)) io.to(`user:${id}`).emit(event, payload);
}

module.exports = { init, notify, participants };
