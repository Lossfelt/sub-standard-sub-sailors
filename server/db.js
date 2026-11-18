// Lagrer ferdige spill i Postgres (Neon) når DATABASE_URL er satt. Uten den gjør lagringen
// ingenting, slik at spillet kjører lokalt og i testene uten database. En feil i lagringen
// skal aldri stoppe spillet, bare skrives til loggen.
import pg from 'pg';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS games (
    id         bigserial PRIMARY KEY,
    started_at timestamptz NOT NULL,
    ended_at   timestamptz NOT NULL DEFAULT now(),
    finished   boolean NOT NULL,
    winner     text,
    seed       text NOT NULL,
    timer      int NOT NULL,
    rounds     int NOT NULL,
    players    int NOT NULL,
    humans     int NOT NULL,
    version    text,
    data       jsonb NOT NULL
  );
  CREATE TABLE IF NOT EXISTS game_players (
    game_id      bigint NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player       text NOT NULL,
    bot          boolean NOT NULL,
    place        int,
    stats        jsonb NOT NULL,
    PRIMARY KEY (game_id, player)
  );
`;

let pool = null;
let ready = null;

function connect() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    pool.on('error', (err) => console.error('Databasefeil:', err.message));
  }
  ready ??= pool.query(SCHEMA);
  return pool;
}

export async function saveGame(record) {
  const db = connect();
  if (!db) return;
  try {
    await ready;
    const { rows } = await db.query(
      `INSERT INTO games (started_at, finished, winner, seed, timer, rounds, players, humans, version, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [record.startedAt, record.finished, record.winner, record.seed, record.timer, record.rounds,
        record.players.length, record.players.filter((p) => !p.bot).length,
        process.env.RENDER_GIT_COMMIT ?? null, record.data],
    );
    const id = rows[0].id;
    for (const { id: player, bot, place, ...stats } of record.players) {
      await db.query('INSERT INTO game_players (game_id, player, bot, place, stats) VALUES ($1, $2, $3, $4, $5)',
        [id, player, bot, place, stats]);
    }
  } catch (err) {
    ready = null; // prøv å lage tabellene på nytt neste gang, i tilfelle det var det som feilet
    console.error('Klarte ikke å lagre spillet:', err.message);
  }
}
