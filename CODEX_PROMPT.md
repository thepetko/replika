# Úvodný prompt pre Codex

Pokračuj vo vývoji projektu `Učenie divadelných replík`.

Najprv si prečítaj:

1. `README.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/LEARNING_LOGIC.md`
4. `docs/BACKLOG.md`
5. `docs/TEST_PLAN.md`
6. aktuálnu implementáciu v `src/index.html`

## Základná filozofia, ktorú nesmieš porušiť

Toto nie je Anki ani systém náhodných kartičiek.

Divadelný text je súvislá sekvencia. Problematic­kú vetu nikdy nezobrazuj náhodne izolovanú mimo jej pôvodného kontextu. Pri chybe pracuj s prechodom, krátkym okolím, významovým blokom alebo celou replikou.

Používateľ nemá vyberať tréningový režim. Interné fázy môžu existovať, ale aplikácia má vždy sama ponúknuť jeden najrozumnejší ďalší krok.

Aplikácia má zostať jednoduchá, mobilná, offline a prístupná pre používateľa so slabším zrakom.

## Prvá vývojová úloha

Urob bezpečný refaktor bez zmeny základného používateľského toku:

1. rozdeľ monolitický `src/index.html` na:
   - `src/index.html`
   - `src/styles.css`
   - `src/app.js`
   - `src/parser.js`
   - `src/learning-engine.js`
   - `src/storage.js`
2. vytvor čistý, deterministický stavový automat v `learning-engine.js`,
3. pridaj automatické testy parsera a stavového automatu,
4. zachovaj fungovanie otvorením statického HTML bez servera, alebo pridaj veľmi jednoduchý lokálny dev server a jasne ho zdokumentuj,
5. oprav zjavné chyby a nejasnosti, ale nepridávaj veľké nové funkcie,
6. na konci zhrň:
   - čo si zmenil,
   - ktoré správanie zostalo rovnaké,
   - aké riziká alebo otvorené otázky si našiel.

## Pracovné pravidlá

- Pred zásadnou zmenou algoritmu pridaj alebo aktualizuj test.
- Preferuj obyčajný JavaScript a minimum závislostí.
- Nevytváraj frameworkovú architektúru bez jasného dôvodu.
- Nepreťažuj UI nastaveniami.
- Texty rozhrania nech zostanú po slovensky.
- Udržuj veľké písmo, kontrast a veľké tlačidlá.
- Neimplementuj náhodné izolované opakovanie viet.
