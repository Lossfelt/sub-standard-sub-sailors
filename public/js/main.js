// Oppstart: kobler sammen nettverk, menyer, HUD og 3D-scenen, og bytter mellom skjermene.
import { Net } from './net.js';
import { Menu } from './menu.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { Stage } from './scene/stage.js';
import { initAudio, play, startAmbient, stopAmbient, toggleMute, isMuted } from './audio.js';
import { RULES_HTML } from './texts.js';

const $ = (id) => document.getElementById(id);
// Brettet står på skrå, så piltastene følger skjermdiagonalene.
const ARROW_SLOTS = { ArrowUp: 'NE', ArrowRight: 'SE', ArrowDown: 'SW', ArrowLeft: 'NW' };
// W, A, S, D flytter utsnittet (piksler per tastetrykk), + og - zoomer.
const PAN_KEYS = { w: [0, 60], s: [0, -60], a: [60, 0], d: [-60, 0] };
const ZOOM_KEYS = { '+': 1.3, '=': 1.3, '-': 1 / 1.3 };
const screens = { menu: $('menu'), lobby: $('lobby'), game: $('game') };

function show(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

const net = new Net();
const menu = new Menu(net);
const stage = new Stage($('stage'), $('labels'));
let game = null;

function leaveRoom() {
  net.leave();
  game.stop();
  stopAmbient();
  show('menu');
}

const hud = new Hud({
  onPad: (slot) => game.onPad(slot),
  onAction: (type) => game.onAction(type),
  onSend: () => game.send(),
  onRotate: (step) => game.rotate(step),
  onZoom: (factor) => stage.zoomBy(factor),
  onAgain: () => net.send({ t: 'again' }),
  onQuit: () => {
    if (window.confirm('Vil du forlate spillet?')) leaveRoom();
  },
  onLayout: () => {
    stage.bottomInset = hud.bottomInset();
  },
});
game = new Game(stage, hud, net);

function openRules() {
  $('rules-body').innerHTML = RULES_HTML; // statisk tekst fra texts.js, ikke brukerinnhold
  $('rules').showModal();
}

$('help').addEventListener('click', openRules);
$('menu-help').addEventListener('click', openRules);
$('leave-lobby').addEventListener('click', leaveRoom);
$('sound').classList.toggle('off', isMuted());
$('sound').addEventListener('click', () => $('sound').classList.toggle('off', toggleMute()));

window.addEventListener('keydown', (e) => {
  const target = e.target instanceof Element ? e.target : document.body;
  if (screens.game.hidden || target.matches('input, select, textarea') || $('rules').open) return;
  if (e.key === 'q' || e.key === 'Q') game.rotate(-1);
  else if (e.key === 'e' || e.key === 'E') game.rotate(1);
  else if (PAN_KEYS[e.key.toLowerCase()]) stage.panBy(...PAN_KEYS[e.key.toLowerCase()]);
  else if (ZOOM_KEYS[e.key]) stage.zoomBy(ZOOM_KEYS[e.key]);
  else if (e.key === 'Enter' && !target.matches('button')) game.send();
  else if (ARROW_SLOTS[e.key]) {
    e.preventDefault();
    game.moveCursor(ARROW_SLOTS[e.key]);
  } else if (e.key === ' ' && !target.matches('button')) {
    e.preventDefault();
    game.selectCursor();
  }
});

net.on('lobby', (msg) => {
  game.stop();
  if (menu.onLobby(msg)) show('lobby');
});

net.on('start', (msg) => {
  show('game');
  stage.resize();
  game.start(msg);
  stage.bottomInset = hud.bottomInset();
  startAmbient();
});

net.on('round', (msg) => game.onRound(msg));
net.on('submitted', (msg) => game.onSubmitted(msg.ids));
net.on('error', (msg) => menu.error(msg.msg));
net.on('gone', () => {
  game.stop();
  show('menu');
});
net.on('status', (status) => {
  if (status === 'closed') {
    menu.error('Mistet forbindelsen til serveren. Prøver igjen ...');
    if (!screens.game.hidden) hud.log('Mistet forbindelsen. Prøver å koble til igjen ...', 'bad');
  } else {
    menu.error('');
  }
});

initAudio();
document.addEventListener('pointerdown', () => play('click', 0), { once: true }); // låser opp lyd i nettleseren
net.connect();
