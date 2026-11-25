// Røyktest for frontenden: starter serveren, åpner siden i Chromium og sjekker
// at JS-en lastes og at man kommer fra menyen inn i et spill. Fanger blant annet
// at en avhengighet (f.eks. three) endrer filstier slik at modulene ikke lastes.
// Kjøres med: npm run test:e2e
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer().listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function startServer() {
  const port = await freePort();
  // Uten DATABASE_URL, så spilloggen ikke prøver å koble til Postgres.
  const env = { ...process.env, PORT: String(port) };
  delete env.DATABASE_URL;
  const proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serveren startet ikke:\n${output}`)), 10_000);
    const onData = (chunk) => {
      output += chunk;
      if (output.includes('kjører på')) { clearTimeout(timer); resolve(); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`serveren avsluttet (${code}):\n${output}`)); });
  });
  return { url: `http://localhost:${port}/`, stop: () => proc.kill() };
}

test('siden laster og man kommer inn i et spill', async (t) => {
  const server = await startServer();
  t.after(() => server.stop());

  // SwiftShader gir WebGL i headless Chromium uten GPU (f.eks. i CI).
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  t.after(() => browser.close());
  const page = await browser.newPage();

  const problems = [];
  page.on('pageerror', (e) => problems.push(`JS-feil: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('requestfailed', (r) => problems.push(`forespørsel feilet: ${r.url()} (${r.failure()?.errorText})`));

  await page.goto(server.url, { waitUntil: 'networkidle' });
  assert.deepEqual(problems, [], `problemer ved lasting av siden:\n${problems.join('\n')}`);
  await page.fill('#name', 'Røyktest');

  // Flerspiller-lobby: opprett rom, legg til bot, start.
  await page.click('#create');
  await page.waitForSelector('#lobby:not([hidden])', { timeout: 5_000 });
  await page.click('#add-bot');
  await page.waitForFunction(() => document.querySelectorAll('#lobby-players li').length >= 2, null, { timeout: 5_000 });
  await page.click('#start');
  await page.waitForSelector('#game:not([hidden])', { timeout: 10_000 });

  // La spillet tegne et par bilder før vi sjekker etter feil.
  await page.waitForTimeout(1_000);
  assert.deepEqual(problems, [], `problemer i nettleseren:\n${problems.join('\n')}`);
});
