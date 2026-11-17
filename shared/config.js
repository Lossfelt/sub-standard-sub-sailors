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
  // Ubåter kan passere gjennom hverandre, men ender to i samme rute er dette sjansen for at de kolliderer.
  collisionChance: 0.5,

  torpedo: {
    speed: 4, // ruter per runde
    armedRounds: 5, // runder torpedoen leter, medregnet runden den skytes ut
    soundBlur: 1, // andres torpedoer høres som lyd spredt så mange ruter rundt den egentlige banen
    minRange: 3, // nærmeste rute man kan sikte på, og ruten på banen der torpedoen armeres
    proximityHitChance: 0.5, // ubåt i naborute
    directHitShare: 0.3, // andel treff som senker umiddelbart
  },

  // Oppdagelsessjanse i prosentpoeng, før avstand i ruter trekkes fra.
  noise: {
    idle: 10,
    // Motoren tåler ikke tomgang: hver runde i strekk man står stille, blir den mer ustabil og
    // bråkete, opp til et tak. Den roer seg straks man kjører igjen.
    idleGrowth: 5,
    idleMax: 40,
    perSpeed: 20,
    torpedo: 50,
    repair: 20,
  },

  sonar: {
    baffleCos: 0.8, // baffles: døv sone bak ubåten i fart, cos 0.8 er omtrent 37 grader til hver side
  },

  damage: {
    repairsNeeded: 2,
    roundsToRepair: 3,
  },

  defaultTimer: 60, // sekunder per runde, 0 = ingen klokke
  contactMemory: 6, // runder en kontakt vises på klientens kart
};

// Farten kan endres i åtte retninger. En diagonal endrer begge akser ett nivå.
export const DIRS = {
  N: { dx: 0, dy: -1 },
  NE: { dx: 1, dy: -1 },
  E: { dx: 1, dy: 0 },
  SE: { dx: 1, dy: 1 },
  S: { dx: 0, dy: 1 },
  SW: { dx: -1, dy: 1 },
  W: { dx: -1, dy: 0 },
  NW: { dx: -1, dy: -1 },
};

export const PLAYER_COLORS = [
  '#f2c230', '#e8553d', '#4fc3f7', '#7bd66b',
  '#c77dff', '#ff9e58', '#f78fb3', '#e6e6e6',
];

export function boardSizeFor(playerCount) {
  return CONFIG.boardBase + CONFIG.boardPerPlayer * playerCount;
}
