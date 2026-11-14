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
