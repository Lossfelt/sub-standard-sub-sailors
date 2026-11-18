// Minikart: hele brettet sett ovenfra i et hjørne, med egen ubåt, kontakter, egne torpedoer og
// utsnittet som vises på skjermen. Vises bare når man har zoomet inn. Trykk på kartet for å
// flytte utsnittet dit.
const CELL = 8; // piksler per rute i kartets egen oppløsning
const BOX = 120; // CSS-piksler kartet får plass i

export class Minimap {
  constructor(wrap, canvas, stage, getGame) {
    this.wrap = wrap;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stage = stage;
    this.getGame = getGame;
    canvas.addEventListener('pointerdown', (e) => this.onPick(e));
  }

  // Kartet dreies som brettet på skjermen, så nord og øst ligger der man ser dem.
  layout(n) {
    const yaw = this.stage.yaw;
    const scale = 1 / (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw)));
    if (this.canvas.width !== n * CELL) {
      this.canvas.width = n * CELL;
      this.canvas.height = n * CELL;
    }
    this.canvas.style.transform = `rotate(${yaw}rad) scale(${scale})`;
    return { yaw, scale };
  }

  draw() {
    const game = this.getGame();
    const show = !!game?.world && this.stage.zoom > 1.05;
    this.wrap.hidden = !show;
    if (!show) return;
    const { board, view } = game;
    const n = board.size;
    this.layout(n);
    const { ctx } = this;
    const dot = (x, y, color, size = CELL - 2) => {
      ctx.fillStyle = color;
      const pad = (CELL - size) / 2;
      ctx.fillRect(x * CELL + pad, y * CELL + pad, size, size);
    };
    ctx.fillStyle = '#0c2738';
    ctx.fillRect(0, 0, n * CELL, n * CELL);
    ctx.fillStyle = '#123448';
    for (let y = 0; y < n; y++) for (let x = (y % 2); x < n; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    for (const k of board.rocks) {
      const [x, y] = k.split(',').map(Number);
      dot(x, y, '#5d6f80', CELL);
    }
    for (const b of game.booms) dot(b.x, b.y, '#ffffff', 4);
    for (const c of game.contacts) dot(c.x, c.y, view.round - c.round === 0 ? '#ffb347' : '#a0702e', 6);
    for (const t of view.torpedoes) if (t.mine) dot(t.x, t.y, '#ff5340', 4);
    for (const s of view.reveal?.subs ?? []) {
      if (s.alive && s.id !== game.you) dot(s.x, s.y, game.players.find((p) => p.id === s.id)?.color ?? '#fff');
    }
    if (view.me.alive) {
      dot(view.me.x, view.me.y, '#000', CELL + 4);
      dot(view.me.x, view.me.y, game.players.find((p) => p.id === game.you)?.color ?? '#f2c230', CELL);
    }
    this.drawView();
  }

  // Utsnittet: der skjermens hjørner treffer bunnen, tegnet som en ramme.
  drawView() {
    const corners = this.stage.viewCorners();
    if (!corners) return;
    const { ctx } = this;
    ctx.strokeStyle = '#f2f8fb';
    ctx.lineWidth = 3; // kartet krympes når det dreies, så tynne streker forsvinner
    ctx.beginPath();
    corners.forEach(({ x, y }, i) => {
      const px = (x + 0.5) * CELL;
      const py = (y + 0.5) * CELL;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  }

  // Fra trykk på kartet tilbake til rute, ved å dreie motsatt vei.
  onPick(e) {
    e.preventDefault();
    const game = this.getGame();
    if (!game?.world) return;
    const n = game.board.size;
    const { yaw, scale } = this.layout(n);
    const rect = this.wrap.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const cell = (BOX * scale) / n;
    const gx = (Math.cos(yaw) * dx + Math.sin(yaw) * dy) / cell + n / 2 - 0.5;
    const gy = (-Math.sin(yaw) * dx + Math.cos(yaw) * dy) / cell + n / 2 - 0.5;
    const clamp = (v) => Math.min(n - 1, Math.max(0, v));
    this.stage.followPoint(this.stage.cellToWorld(clamp(gx), clamp(gy)));
  }
}
