// Norske tekster og små hjelpefunksjoner for å beskrive ting på brettet.
import { CONFIG } from '/shared/config.js';

const T = CONFIG.torpedo;

// Rutenavn som på et sjøkart: kolonnebokstav og radnummer, f.eks. "F7".
export function cellName(x, y) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export const COMPASS = { N: 'N', NE: 'NØ', E: 'Ø', SE: 'SØ', S: 'S', SW: 'SV', W: 'V', NW: 'NV' };
// Piler for de åtte skjermretningene på styreknappene.
export const SLOT_ARROW = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };

export function describeSpeed(vx, vy) {
  const parts = [];
  if (vx) parts.push(`${Math.abs(vx)} ${vx > 0 ? COMPASS.E : COMPASS.W}`);
  if (vy) parts.push(`${Math.abs(vy)} ${vy > 0 ? COMPASS.S : COMPASS.N}`);
  return parts.length ? parts.join(' + ') : 'stille';
}

export const SUNK_CAUSE = {
  direct: 'fikk et direkte treff og sank',
  second: 'ble truffet en gang til og sank',
  flooding: 'rakk ikke å reparere og sank',
};

export const RULES_HTML = `
<h3>Mål</h3>
<ul><li>Vær den siste ubåten som flyter. Ingen ser hverandre, alt handler om lyd.</li>
<li>Alle gir ordre samtidig. Når alle har sendt, avgjøres runden.</li></ul>
<h3>Manøver</h3>
<ul><li>Hver runde kan du endre farten ett nivå i én av åtte retninger. En diagonal endrer begge akser. Farten holder seg til du bremser ved å akselerere motsatt vei.</li>
<li>Maks fart er ${CONFIG.maxSpeed} per akse. Brettkant og fjell stopper ubåten helt.</li></ul>
<h3>Sonar</h3>
<ul><li><b>Lytt:</b> sjanse for å høre hver ubåt = støyen dens minus avstanden i ruter (prosent).</li>
<li>Støy: stille ${CONFIG.noise.idle}, motor ${CONFIG.noise.perSpeed} per fartsnivå, reparasjon ${CONFIG.noise.repair}, torpedoskudd ${CONFIG.noise.torpedo}.</li>
<li><b>Fokuser sonar:</b> søk i et 3×3-område. Står du stille får du nøyaktig rute, er du i fart får du bare ja eller nei. Du hører ikke resten av kartet den runden.</li>
<li>Fjell gir sonarskygge: du hører ikke det som ligger bak dem.</li>
<li>Torpedoskudd, eksplosjoner og senkninger høres av alle.</li></ul>
<h3>Torpedo</h3>
<ul><li>Sikt på en rute minst ${T.minRange} ruter unna. Torpedoen går ${T.speed} ruter per runde og blir liggende ved målet.</li>
<li>Den er uarmert runden den skytes ut, og leter deretter i ${T.armedRounds} runder.</li>
<li>Ubåt i samme rute treffes alltid. Ubåt i naborute treffes med ${T.proximityHitChance * 100} % sjanse. Den bryr seg ikke om hvem som skjøt.</li>
<li>${T.directHitShare * 100} % av treffene er direkte og senker ubåten. Resten gir skade.</li></ul>
<h3>Skade</h3>
<ul><li>En skadet ubåt må reparere ${CONFIG.damage.repairsNeeded} ganger i løpet av ${CONFIG.damage.roundsToRepair} runder, ellers synker den.</li>
<li>Et nytt treff mens du er skadet senker deg.</li></ul>
<h3>Styring</h3>
<ul><li>Dra i brettet (eller bruk W, A, S, D) for å flytte utsnittet. Rull, knip eller bruk + og - for å zoome. Q og E snur brettet. Piltastene flytter rutemarkøren, mellomrom velger ruten og Enter sender ordre.</li></ul>`;
