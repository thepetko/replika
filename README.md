# Replika

Mobilný offline nástroj na učenie súvislých divadelných textov. Zachováva poradie, kontext a prechody; nepoužíva náhodné izolované kartičky.

## Funkcie

- úvodná knižnica hier; každá hra sa učí priamo v celom scenári v pôvodnom poradí,
- vedľajšia knižnica samostatných textov mimo importovaných hier,
- maskovanie vlastných replík pri zachovaní partnerov a scénických poznámok,
- lokálny import celého scenára z DOCX,
- presné pokračovanie rozpracovanej relácie,
- názov a voliteľne hra, postava a scéna,
- automatické učenie viet, päťvetových úsekov a pravidelných kontrol od začiatku,
- scénické poznámky v zátvorkách zachované ako viditeľný kontext,
- nápoveda započítaná ako asistovaný pokus,
- kontrola celej repliky na nasledujúci deň,
- čas viditeľnej aplikácie a štatistiky za 7/30 dní aj celkovo,
- úplný JSON export a obnova dát,
- offline cache po prvom načítaní webovej verzie,
- bez účtu, cloudu a externých závislostí.

Používateľské texty a štatistiky zostávajú v `localStorage` konkrétneho prehliadača. Medzi zariadeniami sa prenášajú exportom a importom backupu.

## Navigácia

Po otvorení aplikácie sa zobrazia hry. Otvorená hra je jeden súvislý scenár s progresom, dnešným cieľom a ovládaním masiek. Samostatné texty zostávajú dostupné z úvodnej obrazovky cez tlačidlo **Samostatné texty**.

## Scény

V karte **Scény** vlož scenár v jednoduchom tvare:

```text
ANNA: Prídem hneď.
PETER: Čakám na teba.
(Anna sa obzrie.)
ANNA: Už idem.
```

Nástroj ukáže rozpoznané postavy, vyberieš svoju a učíš sa vlastné repliky v pôvodnom poradí. Repliky kolegov a scénické poznámky zostávajú viditeľné ako kontext; po každých dvoch nových vlastných replikách príde rastúca kontrola doteraz naučenej časti.

## Import celého scenára

Na obrazovke **Hry** zvoľ **Importovať scenár** a vyber DOCX. Po výbere postavy Replika zachová všetky odseky v pôvodnom poradí. Vlastné repliky môžeš jednotlivo alebo hromadne zakrývať a označovať ako zvládnuté.

## Najjednoduchšie spustenie vo Windows

Dvakrát kliknite na:

```text
OTVORIT_APLIKACIU.cmd
```

Spúšťač zapne lokálny server a otvorí aplikáciu. Čierne okno nechajte počas používania otvorené.

## Ručné spustenie

```powershell
python -m http.server 8000 --directory src
```

Potom otvorte `http://localhost:8000`.

## Testy

Vyžadujú Node.js 20 alebo novší:

```powershell
npm test
```

## Štruktúra

- `src/app.js` – obrazovky hier, denného plánu, knižnice a tréningu,
- `src/script-game.js` – celý scenár, progres a dnešný cieľ,
- `src/learning-engine.js` – čistý deterministický automat,
- `src/parser.js` – delenie textu na vety a bloky,
- `src/storage.js` – verzované dáta, migrácia a backup,
- `src/activity-tracker.js` – čas viditeľnej aplikácie a heartbeat,
- `src/sw.js` – offline aplikačný shell,
- `tests/` – unit testy,
- `.github/workflows/pages.yml` – GitHub Pages deployment iba obsahu `src`.

## GitHub Pages

Workflow je pripravený pre `https://thepetko.github.io/replika/`. Pred prvým pushom treba skontrolovať verejný rozsah a v GitHub nastaveniach prípadne zvoliť **Pages → Source: GitHub Actions**.

`localStorage` na localhoste a na GitHub Pages sú oddelené. Pred prechodom exportujte backup a na novej adrese ho importujte.

## Dokumentácia

- `docs/PRODUCT_SPEC.md` – produktové a UX zásady,
- `docs/LEARNING_LOGIC.md` – aktuálny algoritmus,
- `docs/BACKLOG.md` – ďalší smer,
- `docs/TEST_PLAN.md` – akceptačné scenáre.
