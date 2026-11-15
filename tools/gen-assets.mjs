// Genererer lydeffekter (ElevenLabs) og tittelbilde (OpenAI) til public/assets.
// Kjør: node tools/gen-assets.mjs [--force]   Krever ELEVENLABS_API_KEY og OPENAI_API_KEY.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const FORCE = process.argv.includes('--force');

const SOUNDS = [
  ['ambient', 22, 'Deep ocean underwater ambience inside a submarine, low steady rumble, soft distant creaks, gentle bubbles, calm and tense', true],
  ['ping', 2.5, 'Single classic submarine sonar ping with long underwater echo'],
  ['contact', 1.5, 'Short soft electronic sonar blip, a contact detected on passive sonar'],
  ['launch', 2.5, 'Submarine torpedo launch, burst of compressed air, whoosh and bubbles underwater'],
  ['launch_far', 2, 'Very distant muffled torpedo launch heard through deep water, faint whoosh'],
  ['explosion', 3.5, 'Deep muffled underwater explosion, heavy boom followed by rumbling bubbles'],
  ['hull_hit', 4, 'Submarine hull hit by a nearby explosion, metal groaning, water spraying, alarm klaxon'],
  ['repair', 2, 'Wrench and ratchet clanking on metal pipes inside a submarine, quick repair work'],
  ['sinking', 4, 'Submarine hull creaking and imploding while sinking, deep groaning metal and bubbles'],
  ['engine', 0.7, 'Very short submarine electric motor hum, brief low propeller churn underwater'],
  ['bump', 1.5, 'Dull heavy metallic thud of a submarine hull bumping into rock underwater'],
  ['order', 1, 'Single short brass ship bell ding'],
  ['click', 0.5, 'Short retro mechanical toggle switch click'],
  ['victory', 3, 'Short triumphant retro 8-bit chiptune victory fanfare'],
  ['defeat', 3, 'Short sad descending retro 8-bit chiptune game over jingle'],
];

const IMAGE_PROMPT = 'Detailed isometric pixel art of a small yellow submarine hovering above a tiled '
  + 'seabed diorama deep underwater: mossy stone tiles, jagged underwater mountains, seaweed, coral, '
  + 'a shipwreck, rising bubbles, faint light shafts from above, a dark navy and teal palette with '
  + 'warm yellow accents. Moody, cozy, 16-bit game title screen art. No text, no letters, no UI.';

async function exists(path) {
  return access(path).then(() => true, () => false);
}

async function save(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  console.log(`skrev ${path} (${Math.round(bytes.length / 1024)} kB)`);
}

async function genSound([name, seconds, text, loop]) {
  const path = join(ROOT, 'audio', `${name}.mp3`);
  if (!FORCE && await exists(path)) return;
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.5, ...(loop ? { loop: true } : {}) }),
  });
  if (!res.ok) throw new Error(`lyd ${name}: HTTP ${res.status} ${await res.text()}`);
  await save(path, Buffer.from(await res.arrayBuffer()));
}

async function genImage() {
  const path = join(ROOT, 'img', 'splash.png');
  if (!FORCE && await exists(path)) return;
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt: IMAGE_PROMPT, size: '1536x1024', quality: 'medium' }),
  });
  if (!res.ok) throw new Error(`bilde: HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  await save(path, Buffer.from(json.data[0].b64_json, 'base64'));
}

const jobs = [genImage, ...SOUNDS.map((s) => () => genSound(s))];
let failed = 0;
for (const job of jobs) {
  try {
    await job();
  } catch (err) {
    failed += 1;
    console.error(String(err.message).slice(0, 400));
  }
}
process.exit(failed ? 1 : 0);
