// Lydeffekter. Filene er generert med tools/gen-assets.mjs. Mangler en fil, spilles den bare ikke.
const NAMES = [
  'ping', 'contact', 'launch', 'launch_far', 'explosion', 'hull_hit', 'repair',
  'sinking', 'engine', 'bump', 'order', 'click', 'victory', 'defeat',
];
const MUTE_KEY = 'ssss-muted';

const clips = new Map();
let ambient = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch { /* privat modus uten lagring */ }

function load(name) {
  const audio = new Audio(`/assets/audio/${name}.mp3`);
  audio.preload = 'auto';
  return audio;
}

export function initAudio() {
  for (const name of NAMES) clips.set(name, load(name));
  ambient = load('ambient');
  ambient.loop = true;
  ambient.volume = 0.3;
}

export function play(name, volume = 0.7) {
  const clip = clips.get(name);
  if (muted || !clip) return;
  const instance = clip.cloneNode();
  instance.volume = volume;
  instance.play().catch(() => { /* nettleseren krever et klikk før lyd, eller filen mangler */ });
}

// Bakgrunnslyden kan først starte etter at spilleren har trykket på noe.
export function startAmbient() {
  if (!muted) ambient?.play().catch(() => {});
}

export function stopAmbient() {
  ambient?.pause();
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch { /* ok uten lagring */ }
  if (muted) stopAmbient();
  else startAmbient();
  return muted;
}
