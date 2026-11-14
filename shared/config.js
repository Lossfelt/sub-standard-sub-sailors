// Alle regelkonstanter samlet ett sted, slik at balansen kan justeres uten å lete i koden.
export const CONFIG = {
  minPlayers: 2,
  maxPlayers: 8,
  // Brettstørrelse = boardBase + boardPerPlayer * antall spillere (låst ved spillstart).
  boardBase: 6,
  boardPerPlayer: 2,
  mountainShare: 0.08,
  minSpawnDistance: 4,

  maxSpeed: 2,

  torpedo: {
    speed: 4, // ruter per runde
    armedRounds: 5, // aktive runder etter utskytingsrunden
    minRange: 3, // nærmeste rute man kan sikte på
    proximityHitChance: 0.5, // ubåt i naborute
    directHitShare: 0.3, // andel treff som senker umiddelbart
  },

  // Oppdagelsessjanse i prosentpoeng, før avstand i ruter trekkes fra.
  noise: {
    idle: 10,
    perSpeed: 20,
    torpedo: 50,
    repair: 20,
  },

  damage: {
    repairsNeeded: 2,
    roundsToRepair: 3,
  },

  defaultTimer: 60, // sekunder per runde, 0 = ingen klokke
  contactMemory: 6, // runder en kontakt vises på klientens kart
};

export const DIRS = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

export const PLAYER_COLORS = [
  '#f2c230', '#e8553d', '#4fc3f7', '#7bd66b',
  '#c77dff', '#ff9e58', '#f78fb3', '#e6e6e6',
];

export function boardSizeFor(playerCount) {
  return CONFIG.boardBase + CONFIG.boardPerPlayer * playerCount;
}
