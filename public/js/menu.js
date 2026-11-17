// Startmeny og lobby: navn, opprette eller bli med i rom, legge til bots og starte spillet.
import { CONFIG } from '/shared/config.js';

const $ = (id) => document.getElementById(id);
const NAME_KEY = 'ssss-name';
const SOLO_BOTS = 3;
const MAX_PLAYERS = CONFIG.maxPlayers;
// Liten pikselubåt i 16 x 9 piksler. Skroget tar fargen fra currentColor.
const SUB_ICON = '<path fill="currentColor" d="M6 1h3v2H6zM2 3h11v1h1v3h-1v1H2V7H1V4h1z"/>'
  + '<path fill="#000" opacity=".35" d="M2 6h11v1H2z"/><path fill="#9ff1ff" d="M11 4h1v1h-1zM5 4h1v1H5z"/>'
  + '<path fill="currentColor" opacity=".7" d="M14 4h1v3h-1zM0 5h1v1H0z"/>';

function stored(key) {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export class Menu {
  constructor(net) {
    this.net = net;
    this.soloPending = false;
    this.room = null;
    $('name').value = stored(NAME_KEY);
    $('code').value = (new URLSearchParams(location.search).get('rom') ?? '').toUpperCase().slice(0, 4);

    $('solo').addEventListener('click', () => this.enter({ t: 'create' }, true));
    $('create').addEventListener('click', () => this.enter({ t: 'create' }, false));
    $('join-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const room = $('code').value.trim().toUpperCase();
      if (room.length !== 4) this.error('Romkoden har fire bokstaver.');
      else this.enter({ t: 'join', room }, false);
    });
    $('add-bot').addEventListener('click', () => net.send({ t: 'addBot' }));
    $('timer').addEventListener('change', (e) => net.send({ t: 'setTimer', seconds: Number(e.target.value) }));
    $('start').addEventListener('click', () => net.send({ t: 'start' }));
    $('copy-link').addEventListener('click', () => this.copyLink());
  }

  enter(msg, solo) {
    const name = $('name').value.trim();
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch { /* navnet huskes bare ikke til neste gang */ }
    this.error('');
    this.soloPending = solo;
    this.net.session = null;
    this.net.send({ ...msg, name });
  }

  error(text) {
    $('menu-error').textContent = text;
    $('lobby-error').textContent = text;
  }

  async copyLink() {
    const link = `${location.origin}/?rom=${this.room}`;
    try {
      await navigator.clipboard.writeText(link);
      $('copy-link').textContent = 'Kopiert!';
    } catch {
      this.error(`Kopier selv: ${link}`);
    }
  }

  // Returnerer false når lobbyen ikke skal vises, fordi vi er på vei rett inn i et solospill.
  onLobby(msg) {
    this.room = msg.room;
    if (this.soloPending) {
      this.soloPending = false;
      for (let i = 0; i < SOLO_BOTS; i++) this.net.send({ t: 'addBot' });
      this.net.send({ t: 'start' });
      return false;
    }
    this.renderLobby(msg);
    return true;
  }

  renderLobby(msg) {
    const isHost = msg.players.find((p) => p.id === msg.you)?.host ?? false;
    $('room-code').textContent = msg.room;
    $('copy-link').textContent = 'Kopier lenke';
    $('host-controls').hidden = !isHost;
    $('add-bot').hidden = !isHost;
    $('lobby-wait').hidden = isHost;
    $('timer').value = String(msg.opts.timer);
    $('add-bot').disabled = msg.players.length >= MAX_PLAYERS;
    $('start').disabled = msg.players.length < 2;
    $('start').textContent = msg.players.length < 2 ? 'Trenger minst to ubåter' : 'Dykk!';
    $('crew-count').textContent = `${msg.players.length}/${MAX_PLAYERS}`;
    $('lobby-players').replaceChildren(...msg.players.map((p) => this.crewRow(p, msg.you, isHost)));
  }

  // Én rad i mannskapslisten: ubåt i spillerens farge, navn og merkelapper.
  crewRow(p, you, isHost) {
    const li = document.createElement('li');
    li.classList.toggle('me', p.id === you);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 16 9');
    icon.setAttribute('class', 'crew-sub');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.color = p.color;
    icon.innerHTML = SUB_ICON; // fast tegning, ikke brukerinnhold
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;
    li.append(icon, name);
    for (const [on, text] of [[p.id === you, 'deg'], [p.host, 'vert'], [p.bot, 'bot']]) {
      if (!on) continue;
      const badge = document.createElement('span');
      badge.className = `badge ${text === 'deg' ? 'you' : ''}`;
      badge.textContent = text;
      li.append(badge);
    }
    if (p.bot && isHost) {
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = '×';
      remove.title = 'Fjern boten';
      remove.setAttribute('aria-label', `Fjern ${p.name}`);
      remove.addEventListener('click', () => this.net.send({ t: 'removeBot', id: p.id }));
      li.append(remove);
    }
    return li;
  }
}
