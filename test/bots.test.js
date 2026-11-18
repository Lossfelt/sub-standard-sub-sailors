import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../server/match.js';

// Rom uten nettverk: bare bots, slik at hele spill kan kjøres gjennom i en test.
function botRoom(count) {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Bot ${i + 1}`, bot: true }));
  return {
    players,
    connectedHumans: () => [],
    timerSeconds: () => 0,
    publicPlayers: () => players,
    sendTo() {},
    broadcast() {},
    matchEnded() {},
  };
}

function playBotGame(count, seed, maxRounds = 600) {
  const match = new Match(botRoom(count), seed);
  while (!match.over && match.state.round < maxRounds) match.resolve();
  return match;
}

test('bots spiller ferdig et spill uten å krasje', () => {
  const rounds = [];
  for (let i = 0; i < 30; i++) {
    const match = playBotGame(2 + (i % 5), 1000 + i); // faste frø gir samme spill hver gang
    assert.equal(match.over, true, `spill ${i} ble ikke ferdig på 600 runder`);
    rounds.push(match.state.round);
  }
  const average = rounds.reduce((a, b) => a + b, 0) / rounds.length;
  console.log(`snitt ${average.toFixed(1)} runder, lengste ${Math.max(...rounds)}`);
});

test('spilloggen stemmer med spillet', () => {
  const match = playBotGame(4, 2024);
  const record = match.log.record(true, match.winner);
  assert.equal(record.rounds, match.state.round);
  assert.equal(record.data.rounds.length, match.state.round);
  const winner = record.players.find((p) => p.id === match.winner);
  assert.equal(winner.place, 1);
  assert.equal(winner.sunkRound, null);
  for (const p of record.players.filter((q) => q.id !== match.winner)) {
    assert.ok(p.place > 1 && p.sunkRound > 0, `${p.id} mangler plassering`);
    assert.equal(p.rounds, p.sunkRound, `${p.id} handlet i ${p.rounds} runder, men sank i runde ${p.sunkRound}`);
  }
  const fired = record.data.rounds.flatMap((r) => r.subs).filter((s) => s.act === 'fire').length;
  assert.equal(record.players.reduce((n, p) => n + p.fired, 0), fired);
  assert.ok(JSON.stringify(record).length < 200_000);
  console.log(`logg: ${record.rounds} runder, ${(JSON.stringify(record).length / 1024).toFixed(1)} kB`);
});
