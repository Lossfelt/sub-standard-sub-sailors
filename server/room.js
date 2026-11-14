// Et rom samler spillere før og mellom spill. Selve rundene håndteres av Match.
import { randomUUID } from 'node:crypto';
import { CONFIG, PLAYER_COLORS } from '../shared/config.js';
import { Match } from './match.js';
import { BOT_NAMES } from './bot.js';

const EMPTY_ROOM_TTL = 5 * 60 * 1000; // rom uten tilkoblede spillere ryddes etter fem minutter
const TIMER_CHOICES = [0, 30, 60, 90];

export class Room {
  constructor(code, onClose) {
    this.code = code;
    this.onClose = onClose;
    this.players = [];
    this.phase = 'lobby'; // lobby | game | over
    this.opts = { timer: CONFIG.defaultTimer };
    this.match = null;
    this.nextId = 1;
    this.closeTimer = null;
  }

  connectedHumans() {
    return this.players.filter((p) => !p.bot && p.connected);
  }

  // Klokka brukes bare når flere mennesker spiller sammen. Alene mot bots er det ingen hast.
  timerSeconds() {
    return this.players.filter((p) => !p.bot).length > 1 ? this.opts.timer : 0;
  }

  publicPlayers() {
    return this.players.map(({ id, name, bot, color, connected }) => ({
      id, name, bot, color, connected, host: id === this.hostId,
    }));
  }

  get hostId() {
    return this.connectedHumans()[0]?.id ?? null;
  }

  sendTo(id, msg) {
    const ws = this.players.find((p) => p.id === id)?.ws;
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  }

  broadcast(msg) {
    for (const p of this.connectedHumans()) this.sendTo(p.id, msg);
  }

  broadcastLobby() {
    for (const p of this.connectedHumans()) {
      this.sendTo(p.id, {
        t: 'lobby', room: this.code, you: p.id, token: p.token,
        players: this.publicPlayers(), opts: this.opts,
      });
    }
  }

  addPlayer(name, bot, ws = null) {
    if (this.players.length >= CONFIG.maxPlayers) return null;
    const color = PLAYER_COLORS.find((c) => !this.players.some((p) => p.color === c));
    const player = {
      id: `p${this.nextId++}`, name, bot, color, ws, connected: !bot, token: bot ? null : randomUUID(),
    };
    this.players.push(player);
    return player;
  }

  addBot() {
    const name = BOT_NAMES.find((n) => !this.players.some((p) => p.name === n)) ?? 'Bot';
    return this.addPlayer(name, true);
  }

  rejoin(token, ws) {
    const player = this.players.find((p) => p.token && p.token === token);
    if (!player) return null;
    player.ws?.close();
    player.ws = ws;
    player.connected = true;
    clearTimeout(this.closeTimer);
    if (this.phase === 'lobby') this.broadcastLobby();
    else {
      this.sendTo(player.id, this.match.startMessage(player.id));
      this.match.presenceChanged();
    }
    return player;
  }

  disconnect(id, ws) {
    const player = this.players.find((p) => p.id === id);
    if (!player || player.ws !== ws) return; // en nyere tilkobling har tatt over
    player.connected = false;
    player.ws = null;
    if (this.phase === 'lobby') this.players = this.players.filter((p) => p !== player);
    if (!this.connectedHumans().length) {
      this.match?.presenceChanged();
      const ttl = this.phase === 'lobby' ? 0 : EMPTY_ROOM_TTL;
      this.closeTimer = setTimeout(() => this.close(), ttl);
    } else if (this.phase === 'lobby') {
      this.broadcastLobby();
    } else {
      this.match.presenceChanged();
    }
  }

  close() {
    this.match?.stop();
    this.onClose(this.code);
  }

  startGame() {
    if (this.players.length < CONFIG.minPlayers) return 'Det trengs minst to ubåter. Legg til en bot.';
    this.match = new Match(this);
    this.phase = 'game';
    this.match.arm(); // starter klokka først, slik at startmeldingen har riktig tid igjen
    for (const p of this.connectedHumans()) this.sendTo(p.id, this.match.startMessage(p.id));
    return null;
  }

  matchEnded() {
    this.phase = 'over';
  }

  backToLobby() {
    this.match?.stop();
    this.match = null;
    this.phase = 'lobby';
    this.players = this.players.filter((p) => p.bot || p.connected);
    this.broadcastLobby();
  }

  // Meldinger fra en spiller som allerede er i rommet. Returnerer feiltekst eller null.
  handle(id, msg) {
    const isHost = id === this.hostId;
    const inLobby = this.phase === 'lobby';
    switch (msg.t) {
      case 'addBot':
        if (isHost && inLobby && this.addBot()) this.broadcastLobby();
        return null;
      case 'removeBot':
        if (isHost && inLobby) {
          this.players = this.players.filter((p) => !(p.bot && p.id === msg.id));
          this.broadcastLobby();
        }
        return null;
      case 'setTimer':
        if (isHost && inLobby && TIMER_CHOICES.includes(msg.seconds)) {
          this.opts.timer = msg.seconds;
          this.broadcastLobby();
        }
        return null;
      case 'start':
        return isHost && inLobby ? this.startGame() : null;
      case 'orders':
        if (this.phase === 'game') this.match.submit(id, msg);
        return null;
      case 'again':
        // Etter spillet kan hvem som helst ta rommet tilbake til lobbyen. Underveis bare en senket vert.
        if (this.phase === 'over' || (this.phase === 'game' && isHost && !this.match.isAlive(id))) {
          this.backToLobby();
        }
        return null;
      default:
        return null;
    }
  }
}
