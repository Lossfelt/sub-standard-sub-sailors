// HUD-en i spillet: rundeinfo, spillerliste, loggbok og ordrepanelet. Ren DOM, ingen spillogikk.
import { SLOT_ARROW } from './texts.js';

const $ = (id) => document.getElementById(id);
const MAX_LOG_LINES = 80;
const LOG_KEY = 'ssss-log';

export class Hud {
  constructor(handlers) {
    this.el = {
      round: $('round'), clock: $('clock'), hull: $('hull'), players: $('players'),
      log: $('log'), logPanel: $('log-panel'), orders: $('orders'), hint: $('hint'),
      send: $('send'), speed: $('speed'), noise: $('noise'), banner: $('banner'),
      bannerTitle: $('banner-title'), bannerText: $('banner-text'),
    };
    this.pads = [...document.querySelectorAll('.pad')];
    this.acts = [...document.querySelectorAll('.act')];
    this.deadline = null;
    this.entries = []; // loggen som data, slik at den kan lagres og gjenopprettes
    this.pads.forEach((b) => b.addEventListener('click', () => handlers.onPad(b.dataset.slot)));
    this.acts.forEach((b) => b.addEventListener('click', () => handlers.onAction(b.dataset.action)));
    this.el.send.addEventListener('click', () => handlers.onSend());
    $('rot-left').addEventListener('click', () => handlers.onRotate(-1));
    $('rot-right').addEventListener('click', () => handlers.onRotate(1));
    $('quit').addEventListener('click', () => handlers.onQuit());
    $('again').addEventListener('click', () => handlers.onAgain());
    $('watch').addEventListener('click', () => this.el.banner.classList.add('mini'));
    $('zoom-in').addEventListener('click', () => handlers.onZoom(1.3));
    $('zoom-out').addEventListener('click', () => handlers.onZoom(1 / 1.3));
    $('log-toggle').addEventListener('click', () => this.setLogOpen(this.el.logPanel.classList.contains('collapsed')));
    this.setLogOpen(this.storedLogOpen());
    setInterval(() => this.tickClock(), 250);
    new ResizeObserver(() => handlers.onLayout()).observe(this.el.orders);
  }

  // Høyden ordrepanelet dekker nederst på smale skjermer, slik at brettet kan løftes over det.
  bottomInset() {
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    const height = this.el.orders.hidden ? 0 : this.el.orders.offsetHeight;
    document.documentElement.style.setProperty('--orders-height', `${height}px`);
    if (!height) return 0;
    return height + (narrow ? 76 : 16);
  }

  // Åpen som standard bare på brede skjermer, der loggen har plass ved siden av brettet.
  storedLogOpen() {
    try {
      const saved = localStorage.getItem(LOG_KEY);
      if (saved) return saved === 'open';
    } catch { /* uten lagring brukes standardvalget */ }
    return window.innerWidth >= 1500;
  }

  setLogOpen(open) {
    this.el.logPanel.classList.toggle('collapsed', !open);
    $('log-toggle').setAttribute('aria-expanded', String(open));
    $('log-arrow').textContent = open ? '▾' : '▸';
    try {
      localStorage.setItem(LOG_KEY, open ? 'open' : 'closed');
    } catch { /* valget huskes bare ikke */ }
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  setRound(round) {
    this.el.round.textContent = `Runde ${round}`;
  }

  setClock(timeLeft) {
    this.deadline = timeLeft == null ? null : Date.now() + timeLeft;
    this.tickClock();
  }

  tickClock() {
    const { clock } = this.el;
    if (this.deadline == null) {
      clock.textContent = '';
      return;
    }
    const seconds = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    clock.textContent = `${seconds} s`;
    clock.classList.toggle('urgent', seconds <= 10);
  }

  setHull(me) {
    const { hull } = this.el;
    if (!me.alive) {
      hull.className = 'hull sunk';
      hull.textContent = 'Senket. Du ser nå hele kartet.';
    } else if (me.damage) {
      hull.className = 'hull damaged';
      hull.textContent = `SKADET: ${me.damage.repairs}/2 reparert, ${me.damage.left} runder igjen`;
    } else {
      hull.className = 'hull ok';
      hull.textContent = 'Skrog: helt';
    }
  }

  setPlayers(players, alive, submitted, you) {
    this.el.players.replaceChildren(...players.map((p) => {
      const li = document.createElement('li');
      li.className = alive[p.id] ? '' : 'sunk';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.name + (p.id === you ? ' (deg)' : '');
      const tag = document.createElement('span');
      tag.className = 'tag';
      if (!alive[p.id]) tag.textContent = 'senket';
      else if (!p.bot && !p.connected) tag.textContent = 'frakoblet';
      else if (!p.bot) tag.textContent = submitted.includes(p.id) ? 'klar' : 'tenker';
      li.append(dot, name, tag);
      return li;
    }));
  }

  // slots: { NE: { dir, letter, disabled }, ... } - hvilken kompassretning hver diagonalknapp gir.
  setPads(slots, selectedSlot) {
    for (const pad of this.pads) {
      const { slot } = pad.dataset;
      pad.classList.toggle('on', slot === selectedSlot);
      if (slot === 'hold') continue;
      const info = slots[slot];
      pad.innerHTML = `${SLOT_ARROW[slot]}<small>${info.letter}</small>`;
      pad.setAttribute('aria-label', `Øk farten mot ${info.letter}`);
      pad.disabled = info.disabled;
    }
  }

  setAction(type, repairAllowed) {
    for (const act of this.acts) {
      act.classList.toggle('on', act.dataset.action === type);
      if (act.dataset.action === 'repair') act.disabled = !repairAllowed;
    }
  }

  setReadout(speedText, noise) {
    this.el.speed.textContent = `Fart: ${speedText}`;
    this.el.noise.textContent = `Støy: ${noise}`;
  }

  setHint(text) {
    this.el.hint.textContent = text;
  }

  setSend(enabled, text = 'Send ordre') {
    this.el.send.disabled = !enabled;
    this.el.send.textContent = text;
  }

  setLocked(locked) {
    this.el.orders.classList.toggle('locked', locked);
  }

  showOrders(visible) {
    this.el.orders.hidden = !visible;
  }

  log(text, kind = '') {
    this.entries.push({ text, kind });
    if (this.entries.length > MAX_LOG_LINES) this.entries.shift();
    const li = document.createElement('li');
    li.className = `new ${kind}`;
    li.textContent = text;
    this.el.log.append(li);
    while (this.el.log.children.length > MAX_LOG_LINES) this.el.log.firstChild.remove();
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  logRound(round) {
    for (const li of this.el.log.children) li.classList.remove('new');
    this.log(`Runde ${round}`, 'round');
  }

  clearLog() {
    this.entries = [];
    this.el.log.replaceChildren();
  }

  // Legger tilbake en lagret logg, for eksempel etter gjenoppkobling.
  restoreLog(entries) {
    this.clearLog();
    for (const { text, kind } of entries) this.log(text, kind);
    for (const li of this.el.log.children) li.classList.remove('new');
  }

  // canLeave: om knappen tilbake til lobbyen skal vises (verten underveis, alle etter spillet).
  showBanner(title, text, canLeave = true) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerText.textContent = text;
    $('again').hidden = !canLeave;
    this.el.banner.classList.remove('mini');
    this.el.banner.hidden = false;
  }

  hideBanner() {
    this.el.banner.hidden = true;
  }
}
