# Sub-standard Sub-sailors (S.S.S.S.)

Nettleserspill der hver spiller styrer en ubåt på et rutenett. Ingen ser hverandre. Du lytter
med passiv sonar, gjetter hvor de andre er, og prøver å senke dem med torpedoer før de senker deg.
Alle gir ordre samtidig, og runden avgjøres når alle har sendt.

Idéen og reglene er beskrevet i `Spillidé - Sub-standard Sub-sailors.md`.

## Kom i gang

Krever Node.js 20 eller nyere.

```bash
npm install
npm start
```

Åpne http://localhost:3000. Velg "Spill alene mot bots", eller opprett et rom og del koden
(eller lenken) med andre på samme nettverk. Andre kommandoer:

- `npm run dev` starter serveren på nytt ved endringer i serverkoden
- `npm test` kjører testene for reglene og en simulering der bots spiller hele spill
- `npm run test:e2e` starter serveren og spiller seg fra menyen inn i et spill i headless Chromium (første gang: `npx playwright install chromium`)

## Slik er det bygget

- `shared/` Regelmotoren: bevegelse, torpedoer, skade, sonar og brettgenerering. Ren logikk uten
  nettverk, brukt av både server og klient. Alle tall som påvirker balansen ligger i `shared/config.js`.
- `server/` Node-server uten byggesteg. Serverer filene og kjører spillet over WebSocket (`ws`).
  Serveren er fasit og sender hver spiller bare det den spilleren har lov til å vite.
- `public/` Klienten. three.js med ortografisk kamera, tegnet i lav oppløsning og skalert opp for
  pikselert uttrykk. Brett, fjell og ubåter bygges i kode.
- `tools/gen-assets.mjs` Genererer lydeffekter (ElevenLabs) og tittelbilde (OpenAI) til
  `public/assets`. Trenger `ELEVENLABS_API_KEY` og `OPENAI_API_KEY`, og kjøres bare når du vil lage
  filene på nytt (`--force`).

## Regler slik de er implementert

Kjernereglene følger idédokumentet, med vektorbasert bevegelse og fjell som terreng. Der dokumentet
var åpent for tolkning er dette valgt:

- **Én manøver og én handling per runde.** Manøver er å endre farten ett nivå i én av åtte retninger (eller holde). En diagonal endrer
  begge akser, og avvises hvis én av aksene allerede er på maks.
  Handling er lytt, fokuser sonar, torpedo eller reparer. Passiv sonar virker alltid, unntatt når
  du fokuserer.
- **Avstand** telles i ruter der diagonaler er ett steg. **Fartsnivå** er den største av de to
  aksene, så fart 2 øst + 1 nord er nivå 2.
- **Oppdagelse** er prosentpoeng: støy minus avstand. Skyter du på avstand 10 er sjansen 40 %.
  En kontakt viser nøyaktig rute der ubåten var da runden var ferdig, uten å si hvem det er.
- **Torpedoen** skytes fra der du står før du flytter deg. Den armeres når den når den
  tredje ruten på banen sin (samme avstand som minste sikteavstand), og varer i fem runder. En ubåt i naboruten får ett 50 %-kast per torpedo per runde.
  Armert skiller den ikke mellom venn og fiende, så du kan treffe deg selv hvis du kjører etter den. Alle ser posisjonen
  til alle torpedoer, men ikke hvem som skjøt eller hvor de er på vei.
- **Kollisjon:** ubåter kan passere gjennom hverandre. Ender to i samme rute, og minst én kjørte dit
  den runden, er det 50 % sjanse for kollisjon. Den stopper begge og skader dem som et indirekte treff.
- **Eksplosjoner og senkninger** høres av alle med posisjon. Torpedoskudd høres av alle uten
  posisjon, med mindre den passive sonaren også fanger opp ubåten.
- **Brettkant og fjell** stopper ubåten helt (begge akser).
- **Fjell** (og undersjøiske vulkaner, som bare er et annet utseende) blokkerer bevegelse, gir sonarskygge for både passiv og fokusert sonar, og får
  torpedoer til å eksplodere.
- **Reparasjon:** runden du blir truffet teller ikke. Av de tre neste rundene må to brukes på å reparere.
- **Brettet** er 6 + 2 × antall spillere ruter i hver retning, og endres ikke underveis.
- **Senkede spillere** ser hele kartet som tilskuere.
- **Rundeklokke** (30, 60 eller 90 sekunder) gjelder bare når flere mennesker spiller sammen. Den som
  ikke rekker å sende, holder kursen og lytter.

Ikke med ennå: decoys, strømninger, to dybdenivåer, målsøkende torpedoer og "vanlig" bevegelse.

## Drift

Serveren er én prosess som holder alle rom i minnet. Den kan kjøres hvor som helst som støtter
Node og WebSocket (for eksempel Render): startkommando `npm start`, porten leses fra `PORT`, og
`/healthz` svarer 200. Starter serveren på nytt, forsvinner pågående spill.

### Publisere på Render

Frontend og WebSocket må ligge på samme adresse (klienten kobler til `/ws` på samme vert), så
hele spillet kjører som én Render-tjeneste. `render.yaml` i roten beskriver den.

1. Push repoet til GitHub.
2. I Render: **New > Blueprint**, velg repoet. Render leser `render.yaml` og oppretter tjenesten.
3. Når deployen er grønn, åpne `https://<navn>.onrender.com` og del lenken.

Merk:

- Kjør bare én instans. Rom ligger i minnet, så flere instanser ville splittet spillerne.
- Gratisnivået sover etter en stund uten trafikk, og første besøk tar da lenger tid. Bytt `plan`
  i `render.yaml` til en betalt plan for å unngå det. Sjekk Renders gjeldende vilkår.
- Ved ny deploy eller omstart forsvinner pågående spill.

### Spillogg

Når `DATABASE_URL` er satt (Postgres, for eksempel Neon), lagres hvert spill når det er ferdig
eller avbrutt etter minst én runde. Tabellene lages automatisk. Uten variabelen lagres ingenting.
Kallenavn lagres ikke, bare spiller-ID og om det var en bot.

- `games`: ett spill per rad, med frø, rundeklokke, antall runder, antall mennesker, vinner,
  commit (`version`) og hele rundeloggen i `data` (hver ubåts ordre, posisjon, støy, hvem som
  hørte hvem, treff og senkninger).
- `game_players`: én rad per spiller per spill, med plassering og sammendrag i `stats`
  (torpedoer, fokuserte sonarer, reparasjoner, drap, runder hørt, første runde hørt, runder i
  grop, snittfart, snittstøy og betenkningstid).

Eksempel: hvor mange torpedoer vinnerne skyter sammenlignet med de andre, i spill med mennesker.

```sql
SELECT place = 1 AS vant, avg((stats->>'fired')::int) AS torpedoer,
       avg((stats->>'roundsHeard')::float / (stats->>'rounds')::int) AS andel_hort
FROM game_players JOIN games ON games.id = game_id
WHERE finished AND humans > 0 AND NOT bot
GROUP BY vant;
```
