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
  collision: 'kolliderte med skadet skrog og sank',
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
<li>Motoren er ikke laget for tomgang. For hver runde i strekk du står stille, hoster den ${CONFIG.noise.idleGrowth} mer, opp til ${CONFIG.noise.idleMax}. Den roer seg straks du kjører igjen.</li>
<li><b>Fokuser sonar:</b> søk i et 3×3-område. Står du stille får du nøyaktig rute, er du i fart får du bare ja eller nei. Du hører ikke resten av kartet den runden.</li>
<li>Fjell gir sonarskygge: du hører ikke det som ligger bak dem.</li>
<li>I fart overdøver din egen propell alt som ligger rett bak deg, både for lytting og fokusert sonar. Den døve sonen vises som et mørkt felt bak ubåten.</li>
<li>Torpedoskudd, eksplosjoner og senkninger høres av alle.</li></ul>
<h3>Torpedo</h3>
<ul><li>Sikt på en rute minst ${T.minRange} ruter unna. Torpedoen går ${T.speed} ruter per runde og blir liggende ved målet.</li>
<li>Den armeres først når den når den tredje ruten på banen sin. I de to første rutene kan den ikke treffe noen, heller ikke deg. Den varer i ${T.armedRounds} runder.</li>
<li>Alle ser hvor alle torpedoer er (rød, pulserende ring) og hvilken vei de peker, men ikke hvem som skjøt eller hvor de skal. Andres torpedoer i fart høres som små røde ringer omtrent der de gikk, ikke nøyaktig.</li>
<li>Ubåt i samme rute treffes alltid. Ubåt i naborute treffes med ${T.proximityHitChance * 100} % sjanse. Når den er armert bryr den seg ikke om hvem som skjøt, så ikke kjør etter din egen torpedo.</li>
<li>${T.directHitShare * 100} % av treffene er direkte og senker ubåten. Resten gir skade.</li></ul>
<h3>Skade</h3>
<ul><li>En skadet ubåt må reparere ${CONFIG.damage.repairsNeeded} ganger i løpet av ${CONFIG.damage.roundsToRepair} runder, ellers synker den.</li>
<li>Et nytt treff mens du er skadet senker deg.</li>
<li>Ubåter kan passere gjennom hverandre. Ender to i samme rute er det ${CONFIG.collisionChance * 100} % sjanse for kollisjon, som stopper og skader begge.</li></ul>
<h3>Tegn på brettet</h3>
<ul><li><b>Blå ramme:</b> ruten du står i. <b>Gul ramme</b> og gjennomsiktig ubåt: der du havner neste runde.</li>
<li><b>Oransje ring med diamant:</b> sonarkontakt. Tallet (-1, -2 ...) er hvor mange runder gammel den er, og den blekner med tiden.</li>
<li><b>Rødt kryss:</b> målet til en av torpedoene dine. <b>Rød, pulserende ring:</b> en torpedo. Sirkler den, ligger den ved målet og leter. Tallet over dine egne er hvor mange runder de har igjen.</li>
<li><b>Hvitt kryss:</b> en eksplosjon alle hørte, vises i to runder.</li>
<li><b>Rødlig felt</b> rundt deg når du velger torpedo: for nært til å sikte på. <b>Lyse ruter</b> viser torpedoens bane.</li>
<li><b>Blått felt:</b> området du fokuserer sonaren på. Etter søket er det <b>oransje</b> hvis det er en ubåt der, gråblått hvis tomt, og <b>mørkt</b> der fjell gir sonarskygge.</li>
<li><b>Mørk, veltet ubåt:</b> et vrak. <b>Rykende skorsteiner</b> (vulkaner) og <b>søyleruiner</b> virker som fjell. En ubåt som <b>krenger og lekker bobler</b> er skadet. Bokstaver og tall langs kanten gir rutenavn som "F7".</li>
<li>Tang, koraller, sjøstjerner, krystaller, fisk og bobler er bare pynt.</li></ul>
<h3>Styring</h3>
<ul><li>Dra i brettet (eller bruk W, A, S, D) for å flytte utsnittet. Rull, knip eller bruk + og - for å zoome. Q og E snur brettet. Piltastene flytter rutemarkøren, mellomrom velger ruten og Enter sender ordre.</li></ul>`;
