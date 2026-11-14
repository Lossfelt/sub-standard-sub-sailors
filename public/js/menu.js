// Startmeny og lobby: navn, opprette eller bli med i rom, legge til bots og starte spillet.
const $ = (id) => document.getElementById(id);
const NAME_KEY = 'ssss-name';
const SOLO_BOTS = 3;

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
      $('copy-link').textContent = 'lenken er kopiert';
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
    $('copy-link').textContent = 'kopier lenken';
    $('host-controls').hidden = !isHost;
    $('lobby-wait').hidden = isHost;
    $('timer').value = String(msg.opts.timer);
    $('add-bot').disabled = msg.players.length >= 8;
    $('start').disabled = msg.players.length < 2;
    $('lobby-players').replaceChildren(...msg.players.map((p) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.name;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = [p.id === msg.you && 'deg', p.host && 'vert', p.bot && 'bot'].filter(Boolean).join(', ');
      li.append(dot, name, tag);
      if (p.bot && isHost) {
        const remove = document.createElement('button');
        remove.className = 'link';
        remove.textContent = 'fjern';
        remove.setAttribute('aria-label', `Fjern ${p.name}`);
        remove.addEventListener('click', () => this.net.send({ t: 'removeBot', id: p.id }));
        li.append(remove);
      }
      return li;
    }));
  }
}
