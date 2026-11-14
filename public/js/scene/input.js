// Peker- og tastaturstyring av brettet: klikk velger rute, dra flytter utsnittet,
// hjul eller to fingre zoomer.
const DRAG_THRESHOLD = 7; // piksler før et trykk regnes som dra og ikke klikk

export function attachInput(stage, { onCell, onHover }) {
  const { canvas } = stage;
  const pointers = new Map();
  let dragging = false;
  let pinchDistance = 0;

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    if (pointers.size === 1) dragging = false;
    if (pointers.size === 2) {
      dragging = true; // to fingre er aldri et klikk
      pinchDistance = spread();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') onHover(stage.pick(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const distance = spread();
      if (pinchDistance > 0) stage.zoomBy(distance / pinchDistance);
      pinchDistance = distance;
      return;
    }
    if (!dragging && Math.hypot(p.x - p.startX, p.y - p.startY) > DRAG_THRESHOLD) dragging = true;
    if (dragging) stage.panBy(dx, dy);
  });

  const release = (e) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (p && !dragging && e.type === 'pointerup') {
      const cell = stage.pick(e.clientX, e.clientY);
      if (cell) onCell(cell);
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => onHover(null));

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    stage.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
}
