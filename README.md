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

- **Én manøver og én handling per runde.** Manøver er å endre farten ett nivå (eller holde).
  Handling er lytt, fokuser sonar, torpedo eller reparer. Passiv sonar virker alltid, unntatt når
  du fokuserer.
- **Avstand** telles i ruter der diagonaler er ett steg. **Fartsnivå** er den største av de to
  aksene, så fart 2 øst + 1 nord er nivå 2.
- **Oppdagelse** er prosentpoeng: støy minus avstand. Skyter du på avstand 10 er sjansen 40 %.
  En kontakt viser nøyaktig rute der ubåten var da runden var ferdig, uten å si hvem det er.
- **Torpedoen** skytes fra der du står før du flytter deg. Den er uarmert i utskytingsrunden og
  leter deretter i fem runder. En ubåt i naboruten får ett 50 %-kast per torpedo per runde.
  Torpedoen skiller ikke mellom venn og fiende, så du kan treffe deg selv.
- **Eksplosjoner og senkninger** høres av alle med posisjon. Torpedoskudd høres av alle uten
  posisjon, med mindre den passive sonaren også fanger opp ubåten.
- **Brettkant og fjell** stopper ubåten helt (begge akser).
- **Fjell** blokkerer bevegelse, gir sonarskygge for både passiv og fokusert sonar, og får
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
