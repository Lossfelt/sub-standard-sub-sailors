# Idéer for videreutvikling

Uprioritert idébank. Det som står under "Fra idédokumentet" er dine opprinnelige tanker, resten er
forslag. Stjerne (★) betyr at jeg tror idéen gir mye moro for innsatsen.

## Skal gjøres

- **Gjenstående visuelle forbedringer:**
  - Skipsvrak og større ruiner som pynt (søyleruiner finnes nå som en variant av fjellruter)
  - Flere biotoper, for eksempel skipskirkegård (korallrev, dyphavsslette og isdekke finnes)
  - Penere lobby

## Nye tanker fra Levin

- Kanskje man ikke skal kunne stå stille, men alltid må ha minimum 1 i hastighet i en retning, slik at spillerne ikke bare venter i hvert sitt hjørne av brettet. Alternativt at hvis man slår av motoren så tar det litt tid å starte den igjen.
- Slutt-popup'en, der hvor det står seier (evt det som dukker opp for tapere som har blitt værende for å se på spillet), burde vise hvem som sank hvilken runde, og hvorfor. Feks "R 31 Admiral Lekk ble torpedert av Levin". Kanskje også noe om hvor mange ganger man har reparert båten, med mindre det blir for mye info.
- Det bør være en sonar-skygge rett bak ubåten, for å simulere "the baffles" hvor man ikke hører noe pga sin egen rotor.
- Torpedoer som ikke ses nøyaktig med en gang: langt unna hører man bare generelle lyder omtrent der torpedoen er og går. Jo nærmere man er, jo mer presis blir ruten og cellen. Når man er ganske nær, eller torpedoen har vært på kartet noen runder, ser man den helt nøyaktig. (Første steg er gjort: andres torpedoer i fart høres som spredte røde ringer.)

## Fra idédokumentet

- **Decoys.** Ubåten slipper en lokkedue som begynner å lage ubåtlyd etter et valgt antall runder.
  Åpent: hvor mange man har, om den driver, og om en torpedo lar seg lure av den.
- **Mer terreng:**
  - Groper man kan gjemme seg i (lavere støy, men vanskelig å komme opp av?)
  - Strømninger som flytter ubåter og torpedoer en rute per runde
  - To dybdenivåer med en kant på tvers av kartet, der man ikke hører hverandre på tvers av nivåene
- **Målsøkende torpedo.** Torpedoen oppdager ubåter flere ruter unna og svinger mot dem, i stedet
  for bare 50 % sjanse i naboruten. Bør kanskje koste noe, for eksempel kortere rekkevidde.
- **Kantstraff.** Treffer man brettkanten, mister man muligheten til å akselerere i én runde.
- **Høyere toppfart**, for eksempel 3, med tilsvarende mer støy.
- **"Vanlig" bevegelse** som alternativ til vektorbevegelse, valgt i lobbyen.
- **Bedre sporing av kjent kontakt.** Økt sjanse for å holde på en ubåt man allerede har oppdaget
  (forkastet i første omgang, men kan prøves).
- **Begrenset torpedolager** hvis ubegrenset viser seg å gi for mye skyting.

## Nye spillmekanikker

- ★ **Reprise etter spillet.** Spill av hele kampen med alt avslørt: alle ubåter, baner og bomskudd.
  Halve moroa med skjult informasjon er å se etterpå hvor nære man var.
- ★ **Peiling i stedet for posisjon på lang avstand.** Fjerne kontakter gir bare retning (en strek
  over kartet), nære gir rute. Da må man krysspeile fra to steder, som er selve ubåtfølelsen.
- ★ **Aktiv sonar som risikabelt valg.** Ett ping avslører alt innenfor en radius, men avslører også
  deg for hele kartet. I dag står det at ingen bruker det, men som desperat siste utvei er det dramatisk.
- ★ **Sluttspill-press.** Bot-mot-bot og to-spiller-sluttspill kan dra ut. Idéer: brettet krymper
  (vulkanutbrudd spiser kanten), eller all støy øker gradvis etter runde N.
- **Mottiltak.** Slipp en støybøye som trekker til seg torpedoer i nærheten i én runde.
- **Miner.** Legges i egen rute, armeres etter et par runder, og ligger til noen kjører på dem.
- **Stille gange.** Fart 1 med ekstra lav støy, men da kan man verken skyte eller reparere.
- **Torpedotyper.** Rask og rett frem, treg og målsøkende, eller en som ligger lenge og vokter et område.
- **Omlading.** Ett rør som må lades i en runde, i stedet for lagerbegrensning.
- **Ubåtklasser.** For eksempel rask og bråkete, treg og stillegående, eller en med to rør.
- **Funn på havbunnen.** Vrak og kasser med engangsutstyr (ekstra decoy, bedre sonar en stund).
  Gir en grunn til å bevege seg, og dermed lage lyd, i stedet for å ligge stille.
- **Skadevarianter.** Et treff slår ut noe konkret: sonar, ett rør eller toppfart, til det er reparert.
- **Termoklin.** Et lag i vannet som demper lyd mellom over og under, som en enklere versjon av
  to dybdenivåer.
- **Hendelser.** Hvalsang som gir falske kontakter, vulkanutbrudd som overdøver sonaren en runde.

## Flerspiller og struktur

- ★ **Lagspill.** To mot to med delt sonarbilde, eller alle mot én "sjef" med flere liv.
- **Omkamp og poengtavle.** Tell seire over flere spill i samme rom.
- **Vanskelighetsgrader og personligheter på bots.** Forsiktig, aggressiv, kamikaze.
- **Raske meldinger.** Et lite sett ferdige radiomeldinger eller emojier mellom spillere.
- **Tilskuermodus** for folk som blir med etter at spillet har startet.
- **Innstillinger i lobbyen.** Brettstørrelse, andel fjell, kollisjonssjanse og andre tall fra
  `shared/config.js`, slik at man kan prøve regelvarianter uten å endre kode.
- **Rom som overlever omstart.** I dag ligger alt i minnet på serveren.

## Brukeropplevelse

- ★ **Opplæring.** Et kort, styrt første spill som viser lytting, fokusering og torpedo.
- **Sonarhistorikk.** Linje mellom kontakter som trolig er samme ubåt, med anslått kurs og fart.
- **Egne notater på kartet.** Sett en markør der du tror noen er.
- **Støymåler.** Vis hvor langt unna du sannsynligvis høres med valgt ordre.
- **Advarsel før selvskading.** Si fra hvis valgt kurs ender inntil din egen armerte torpedo.
- **Retningsbestemt lyd.** Kontakter og eksplosjoner i stereo ut fra hvor de er på kartet.
- **Musikk** som bygger seg opp når færre ubåter er igjen.
- **Vibrasjon på mobil** ved treff, og mulighet for å installere spillet som app (PWA).
- **Tilgjengelighet.** Fargeblindvennlige markører og full tastaturstyring av rutevalg med fokusmarkør.

## Teknisk

- Ende-til-ende-test som spiller et helt spill gjennom nettleseren.
- Komprimer tittelbildet (2 MB i dag) og vurder å samle lydene i én fil.
- Lagre spillfrø og ordre per runde, slik at et spill kan gjenskapes ved feilsøking og brukes til reprise.
