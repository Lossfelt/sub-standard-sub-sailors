// WebSocket-forbindelsen til serveren, med automatisk gjenoppkobling til et pågående spill.
const SESSION_KEY = 'ssss-session';
const RETRY_MS = 2000;

export class Net {
  constructor() {
    this.handlers = new Map();
    this.ws = null;
    this.queue = [];
    this.closedByUser = false;
  }

  on(type, handler) {
    this.handlers.set(type, handler);
  }

  emit(type, payload) {
    this.handlers.get(type)?.(payload);
  }

  get session() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  }

  set session(value) {
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* uten lagring virker alt unntatt gjenoppkobling etter sideoppfrisking */ }
  }

  connect() {
    this.closedByUser = false;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/ws`);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.emit('status', 'open');
      const { session } = this;
      if (session) ws.send(JSON.stringify({ t: 'rejoin', ...session }));
      for (const msg of this.queue.splice(0)) ws.send(JSON.stringify(msg));
    });
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'lobby') this.session = { room: msg.room, token: msg.token };
      if (msg.t === 'error' && msg.msg === 'gone') {
        // Rommet finnes ikke lenger. Glem økten og gå til menyen.
        this.session = null;
        this.emit('gone');
        return;
      }
      this.emit(msg.t, msg);
    });
    ws.addEventListener('close', () => {
      if (this.ws !== ws || this.closedByUser) return;
      this.emit('status', 'closed');
      setTimeout(() => this.connect(), RETRY_MS);
    });
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  // Forlater rommet med vilje: glem økten og start med blank forbindelse.
  leave() {
    this.session = null;
    this.closedByUser = true;
    this.queue = [];
    this.ws?.close();
    this.connect();
  }
}
