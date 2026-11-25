// Hvilke filer på disk som serveres på hvilke URL-er. Egen modul så testene kan
// sjekke stiene i frontenden mot nøyaktig samme oppslag som serveren bruker.
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// URL-prefiks -> mappe på disk. Første treff vinner, så de mest spesifikke står først.
const MOUNTS = [
  ['/vendor/three/', join(ROOT, 'node_modules', 'three', 'build')],
  ['/vendor/fonts/vt323/', join(ROOT, 'node_modules', '@fontsource', 'vt323')],
  ['/vendor/fonts/pixelify-sans/', join(ROOT, 'node_modules', '@fontsource', 'pixelify-sans')],
  ['/shared/', join(ROOT, 'shared')],
  ['/', join(ROOT, 'public')],
];

export function resolveFile(urlPath) {
  const path = urlPath === '/' ? '/index.html' : urlPath;
  for (const [prefix, dir] of MOUNTS) {
    if (!path.startsWith(prefix)) continue;
    const file = normalize(join(dir, path.slice(prefix.length)));
    // Hindrer at "../" i URL-en når filer utenfor den monterte mappen.
    return file.startsWith(dir + sep) ? file : null;
  }
  return null;
}
