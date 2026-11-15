// Bygger det hver enkelt spiller har lov til å vite. Serveren sender aldri hele
// spilltilstanden til en levende spiller, slik at skjult informasjon ikke kan leses i nettleseren.
import { CONFIG } from '../shared/config.js';

// Alle hører hvor torpedoene er, men bare eieren (og tilskuere) vet målet og hvor lenge de varer.
const torpedoFor = (t, id, full) => {
  const mine = t.owner === id;
  const seen = { id: t.id, x: t.x, y: t.y, mine, loitering: t.step >= t.path.length };
  if (!mine && !full) return seen;
  return { ...seen, tx: t.tx, ty: t.ty, roundsLeft: CONFIG.torpedo.armedRounds - t.age };
};

export function buildView(match, id) {
  const { state } = match;
  const me = state.subs.find((s) => s.id === id);
  const spectating = !me.alive || match.over;
  return {
    round: state.round,
    timeLeft: match.deadline ? Math.max(0, match.deadline - Date.now()) : null,
    me: { x: me.x, y: me.y, vx: me.vx, vy: me.vy, alive: me.alive, damage: me.damage },
    torpedoes: state.torpedoes.map((t) => torpedoFor(t, id, false)),
    alive: Object.fromEntries(state.subs.map((s) => [s.id, s.alive])),
    // Senkede spillere og sluttskjermen får se alt.
    reveal: spectating ? {
      subs: state.subs.map((s) => ({ id: s.id, x: s.x, y: s.y, alive: s.alive, damaged: !!s.damage })),
      torpedoes: state.torpedoes.map((t) => torpedoFor(t, id, true)),
    } : null,
  };
}

export function buildReport(match, ev, id, wasAlive) {
  return {
    round: ev.round,
    move: wasAlive ? ev.moves[id] : null,
    action: ev.actions[id]?.type ?? null,
    contacts: ev.contacts[id] ?? [],
    focus: ev.focus[id] ?? null,
    launchesHeard: ev.launches.filter((l) => l.owner !== id).length,
    // Eksplosjoner og senkninger høres av alle, med posisjon.
    explosions: ev.explosions.map((e) => ({
      x: e.x, y: e.y, kind: e.kind, mine: e.owner === id, onMe: e.victim === id,
    })),
    sunk: ev.sunk,
    hit: ev.hits[id] ?? null,
    // En kollisjon merkes bare av de to som støtte sammen.
    collision: ev.collisions.find((c) => c.ids.includes(id)) ?? null,
    repair: ev.repairs[id] ?? null,
    torpedoTracks: ev.torpedoTracks.filter((t) => t.owner === id),
  };
}
