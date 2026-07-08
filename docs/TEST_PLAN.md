# Testovací plán

## Parser

Automatizované scenáre sa nachádzajú v `tests/parser.test.js`.

### Jednoduché vety

Vstup:

```text
Prišiel som domov. Nikto tam nebol. Prečo si odišiel?
```

Očakávanie:

- 3 vety,
- 1 blok.

### Prázdny riadok

Vstup:

```text
Prvá veta. Druhá veta.

Tretia veta. Štvrtá veta.
```

Očakávanie:

- 4 vety,
- 2 bloky,
- hranice `0–1` a `2–3`.

### Zalomenie bez bodky

Jednoduché zalomenie bez interpunkcie sa nahradí medzerou. Nevytvorí samostatnú vetu ani nestratí prvý riadok.

### Hraničné prípady

- úvodzovky,
- tri bodky,
- otáznik a výkričník spolu,
- skratky,
- prázdny text,
- text s jednou vetou.

## Učenie jednej vety

Automatizované scenáre stavového automatu sa nachádzajú v `tests/learning-engine.test.js`.

- začne sa fázou novej vety,
- po `Viem` sa prejde na celú repliku,
- po úspešnom dokončení sa zobrazí koniec.

## Lineárne učenie

Pre 5 viet:

1. veta 1,
2. veta 2,
3. prechod 1–2,
4. ďalšia veta,
5. po približne troch vetách blok,
6. žiadna veta sa nesmie objaviť náhodne mimo poradia.

## Chyba na novej vete

Pri `Neviem` na vete 4:

- ďalšia úloha musí obsahovať vetu 4,
- musí obsahovať primeraný predchádzajúci kontext,
- nesmie preskočiť na nesúvisiacu vetu.

## Chyba v bloku

Pri chybe vo vetách 1–5:

- systém má zmenšiť úsek okolo konca alebo problémového miesta,
- nesmie vytiahnuť jednu náhodnú vetu bez kontextu,
- po úspechu sa má bezpečne vrátiť k rastúcemu bloku.

## Viac prirodzených blokov

- systém sa naučí prvý blok,
- potom začne druhý,
- neskôr preverí spojenie a celú repliku,
- hranica bloku nesmie úplne zrušiť sekvenčný kontext.

## Navigácia

- `Krok späť` obnoví predchádzajúci stav,
- `Zopakovať aktuálny úsek` nezmení poradie textu,
- `Nahrať novú repliku` zachová uložený text, kým ho používateľ neprepíše alebo nevymaže.

## Knižnica a backup

- rozpracovaná relácia sa obnoví v stave čítania, vybavovania aj hodnotenia,
- zmena textu vynuluje iba učebný postup danej repliky,
- poškodený backup nezmení lokálne dáta,
- platný import nahradí knižnicu aj štatistiky,
- pred importom sa vytvorí bezpečnostný export.

## Čas a štatistiky

- počíta sa iba viditeľná aplikácia,
- interval cez polnoc sa rozdelí do dvoch dní,
- dlhé uspatie zariadenia sa nezapočíta celé,
- dve karty nepočítajú čas súčasne.

## Prístupnosť

- celá hlavná cesta je ovládateľná klávesnicou,
- focus je viditeľný,
- tlačidlá majú zrozumiteľné názvy,
- pri 200 % zväčšení sa obsah neprekrýva,
- mobilné tlačidlá majú dostatočnú veľkosť,
- stav nie je komunikovaný iba farbou.

## Regresná zásada

Každá zmena algoritmu musí mať test, ktorý potvrdí:

> Problematic­ká veta sa nikdy nevráti ako náhodná izolovaná kartička bez súvislosti s pôvodným poradím.

## Spustenie automatických testov

V koreňovom adresári projektu:

```powershell
npm test
```

Manuálne kontroly prístupnosti, 200 % zväčšenia a mobilného rozloženia zostávajú súčasťou testovania v prehliadači.
