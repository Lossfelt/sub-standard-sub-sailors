// Spiller av rapporten fra en avgjort runde: animasjoner, lyd og loggbok, i en rekkefølge
// som gjør det mulig å følge med på hva som skjedde.
import { play } from './audio.js';
import { cellName, SUNK_CAUSE } from './texts.js';

async function playMovement(game, report) {
  const { world, hud } = game;
  const tasks = report.torpedoTracks.map((track) => world.moveTorpedo(track));
  if (report.action === 'fire') {
    play('launch', 0.7);
    hud.log('Torpedo ute! Den armeres neste runde.');
  }
  if (report.move?.path.length) {
    play('engine', 0.3);
    tasks.push(world.moveSub(report.move));
  }
  await Promise.all(tasks);
  if (report.move?.bumped) {
    play('bump', 0.8);
    hud.log('Vi kjørte rett i noe hardt. Full stopp.', 'bad');
  }
  for (const track of report.torpedoTracks) {
    if (track.end === 'spent') hud.log('En av torpedoene våre gikk tom for drivstoff og sank.');
  }
}

async function playExplosions(game, report) {
  const { world, hud } = game;
  if (report.launchesHeard) {
    play('launch_far', 0.5);
    hud.log(report.launchesHeard === 1
      ? 'Sonar: noen har skutt ut en torpedo.'
      : `Sonar: ${report.launchesHeard} torpedoer er skutt ut.`, 'sonar');
  }
  for (const e of report.explosions) {
    play('explosion', e.onMe ? 1 : 0.7);
    game.booms.push({ x: e.x, y: e.y, round: report.round });
    const where = cellName(e.x, e.y);
    if (e.kind === 'rock') {
      hud.log(e.mine ? `Torpedoen vår sprengte et fjell ved ${where}.` : `En torpedo eksploderte mot fjell ved ${where}.`);
    } else if (!e.onMe) {
      hud.log(e.mine ? `TREFF! Torpedoen vår traff en ubåt ved ${where}.` : `En ubåt ble truffet ved ${where}.`, e.mine ? 'good' : 'sonar');
    }
    await world.effects.explosion(e.x, e.y);
  }
  if (report.hit) {
    world.stage.shake = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.9;
    play('hull_hit', 0.9);
    hud.log(report.hit === 'direct'
      ? 'Direkte treff. Vann overalt. Det var det.'
      : 'Vi er truffet! Skroget lekker. Reparer to ganger innen tre runder, ellers synker vi.', 'bad');
  }
}

async function playSinkings(game, report) {
  const { world, hud } = game;
  for (const s of report.sunk) {
    play('sinking', 0.8);
    world.addWreck(s.id, s.x, s.y);
    const mine = s.id === game.you;
    hud.log(mine
      ? `Vi ${SUNK_CAUSE[s.cause]}. Takk for innsatsen, mannskap.`
      : `${game.playerName(s.id)} ${SUNK_CAUSE[s.cause]} ved ${cellName(s.x, s.y)}.`, mine ? 'bad' : 'good');
    await world.effects.wait(0.5);
  }
  if (report.repair?.done) {
    play('repair', 0.7);
    hud.log('Skroget er tett igjen. Godt jobbet.', 'good');
  } else if (report.repair) {
    if (report.action === 'repair') play('repair', 0.7);
    hud.log(`Reparasjon ${report.repair.repairs} av 2 utført. ${report.repair.left} runder igjen.`, 'bad');
  }
}

function playFocus(game, focus) {
  const { world, hud } = game;
  const { markers, effects } = world;
  const where = cellName(focus.cx, focus.cy);
  markers.set('shadow', focus.hidden);
  play('ping', 0.6);
  effects.ping(focus.cx, focus.cy, '#58d6ff', 3.4);
  if (!focus.found) {
    markers.set('focusMiss', focus.cells);
    hud.log(`Fokusert sonar rundt ${where}: tomt.`, 'sonar');
  } else if (focus.exact) {
    markers.set('focusMiss', focus.cells);
    for (const [x, y] of focus.positions) {
      game.contacts.push({ x, y, round: game.reportRound });
      hud.log(`Fokusert sonar: ubåt nøyaktig i ${cellName(x, y)}!`, 'sonar');
    }
  } else {
    markers.set('focusHit', focus.cells);
    hud.log(`Fokusert sonar rundt ${where}: det er en ubåt i området.`, 'sonar');
  }
  if (focus.hidden.length) hud.log('Deler av området ligger i sonarskygge bak fjell.');
}

async function playSonar(game, report) {
  const { world, hud } = game;
  const { markers, effects } = world;
  for (const name of ['shadow', 'focusHit', 'focusMiss']) markers.set(name, []);
  if (report.focus) playFocus(game, report.focus);
  for (const c of report.contacts) {
    game.contacts.push({ x: c.x, y: c.y, round: report.round });
    effects.ping(c.x, c.y, '#ffb347');
    hud.log(`Sonar: kontakt i ${cellName(c.x, c.y)}.`, 'sonar');
  }
  if (report.contacts.length) play('contact', 0.7);
  else if (report.action && !report.focus) hud.log('Sonar: ingenting å høre.');
  await effects.wait(0.35);
}

export function showGameOver(game, over) {
  const { hud } = game;
  game.over = true;
  hud.showOrders(false);
  game.stage.bottomInset = 0;
  if (over.winner === game.you) {
    play('victory', 0.7);
    hud.showBanner('Seier!', 'Du er den siste ubåten som flyter. Sånn noenlunde.');
  } else if (over.winner) {
    play('defeat', 0.7);
    hud.showBanner('Senket', `${game.playerName(over.winner)} vant. Havbunnen er i det minste rolig.`);
  } else {
    play('defeat', 0.7);
    hud.showBanner('Uavgjort', 'Alle sank. Ingen vant. Typisk.');
  }
}

export async function playRound(game, msg) {
  const { report, view } = msg;
  const wasAlive = game.view.me.alive;
  game.reportRound = report.round;
  game.submitted = [];
  game.refreshPlayers();
  game.hud.logRound(report.round);
  game.hud.setLocked(true);
  game.world.showGhost(game.view.me, null);
  game.world.markers.clearSelection();
  await playMovement(game, report);
  await playExplosions(game, report);
  await playSinkings(game, report);
  if (wasAlive && view.me.alive) await playSonar(game, report);
  game.view = view;
  game.applyView();
  if (wasAlive && !view.me.alive && !msg.over) {
    const isHost = game.players.find((p) => p.id === game.you)?.host ?? false;
    game.hud.showBanner('Senket', 'Du følger resten av spillet som tilskuer og ser hele kartet.', isHost);
  }
  if (msg.over) showGameOver(game, msg.over);
  game.beginRound();
}
