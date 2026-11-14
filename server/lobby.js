// Tar imot nye WebSocket-tilkoblinger og kobler dem til riktig rom.
import { Room } from './room.js';

const rooms = new Map();
const CODE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // uten I, O og Q som er lette å forveksle

function makeCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

function cleanName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return name || 'Kaptein Anonym';
}

function enterRoom(msg, ws) {
  if (msg.t === 'create') {
    const code = makeCode();
    const room = new Room(code, (c) => rooms.delete(c));
    rooms.set(code, room);
    return { room, player: room.addPlayer(cleanName(msg.name), false, ws) };
  }
  const room = rooms.get(String(msg.room ?? '').toUpperCase().trim());
  if (!room) return { error: msg.t === 'rejoin' ? 'gone' : 'Fant ikke noe rom med den koden.' };
  if (msg.t === 'rejoin') {
    const player = room.rejoin(msg.token, ws);
    return player ? { room, player, rejoined: true } : { error: 'gone' };
  }
  if (room.phase !== 'lobby') return { error: 'Spillet i det rommet er allerede i gang.' };
  const player = room.addPlayer(cleanName(msg.name), false, ws);
  return player ? { room, player } : { error: 'Rommet er fullt.' };
}

export function handleConnection(ws) {
  let room = null;
  let playerId = null;
  const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (room) {
        const error = room.handle(playerId, msg);
        if (error) send({ t: 'error', msg: error });
        return;
      }
      if (!['create', 'join', 'rejoin'].includes(msg.t)) return;
      const result = enterRoom(msg, ws);
      if (result.error) {
        send({ t: 'error', msg: result.error });
        return;
      }
      room = result.room;
      playerId = result.player.id;
      if (!result.rejoined) room.broadcastLobby();
    } catch (err) {
      console.error('Feil ved håndtering av melding:', err);
      send({ t: 'error', msg: 'Noe gikk galt på serveren.' });
    }
  });

  ws.on('close', () => room?.disconnect(playerId, ws));
  ws.on('error', (err) => console.error('WebSocket-feil:', err.message));
}
