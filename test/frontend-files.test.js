// Sjekker at alle filene frontenden laster faktisk finnes, uten å starte en nettleser.
// Går fra index.html gjennom import-mappet og alle import-setninger (også inn i
// node_modules/three) og CSS-ens url(...). Fanger f.eks. at en ny versjon av three
// fjerner eller flytter en fil (r187 fjernet three.module.min.js).
// Fanger ikke feil som oppstår når koden kjører, som endrede API-er.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolveFile } from '../server/static.js';

const BASE = 'http://localhost';

// Statiske import/export ... from '...', import '...' og import('...') med strengliteral.
const IMPORT_RE = /(?:\bimport|\bexport)\s*(?:[\w*{}\s,$]*?\bfrom\s*)?\(?\s*(['"])([^'"\n]+)\1/g;
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

function readUrl(path) {
  const file = resolveFile(path);
  return file && existsSync(file) ? readFileSync(file, 'utf8') : null;
}

test('alle filer frontenden laster finnes', () => {
  const html = readUrl('/');
  assert.ok(html, 'fant ikke index.html');

  const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  const importMap = mapMatch ? JSON.parse(mapMatch[1]).imports : {};

  const missing = [];
  const seen = new Set();
  const queue = [];

  // Legger til en URL (relativ til `from`) og husker hvem som refererte til den.
  function add(ref, from) {
    if (/^(data:|https?:|#)/.test(ref)) return;
    const path = decodeURIComponent(new URL(ref, BASE + from).pathname);
    if (seen.has(path)) return;
    seen.add(path);
    queue.push({ path, from });
  }

  for (const [, , ref] of html.matchAll(/\b(src|href)="([^"]+)"/g)) add(ref, '/');
  for (const target of Object.values(importMap)) add(target, '/');

  while (queue.length) {
    const { path, from } = queue.shift();
    const source = readUrl(path);
    if (source === null) { missing.push(`${path} (referert fra ${from})`); continue; }

    if (path.endsWith('.js')) {
      for (const [, , spec] of source.matchAll(IMPORT_RE)) {
        if (/^[./]/.test(spec)) add(spec, path);
        else if (importMap[spec]) add(importMap[spec], '/');
        else missing.push(`"${spec}" er ikke i import-mappet (importert i ${path})`);
      }
    } else if (path.endsWith('.css')) {
      for (const [, , ref] of source.matchAll(CSS_URL_RE)) add(ref, path);
    }
  }

  assert.deepEqual(missing, [], `filer som mangler:\n${missing.join('\n')}`);
  // Vern mot at regexene slutter å treffe og testen blir grønn uten å sjekke noe.
  assert.ok(seen.has('/vendor/three/three.core.js'), 'fulgte ikke importene inn i three');
  assert.ok(seen.has('/shared/config.js'), 'fulgte ikke importene inn i /shared/');
});
