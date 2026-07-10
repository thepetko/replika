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
- scénické poznámky na začiatku, na konci a viac poznámok za sebou,
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
5. po približne troch vetách súvislý úsek,
6. po piatej novej vete kumulatívna kontrola od začiatku,
7. medzi kumulatívnymi kontrolami najviac posledných päť viet,
8. žiadna veta sa nesmie objaviť náhodne mimo poradia.

## Chyba na novej vete

Pri `Neviem` na vete 4:

- ďalšia úloha musí obsahovať vetu 4,
- musí obsahovať primeraný predchádzajúci kontext,
- nesmie preskočiť na nesúvisiacu vetu.

## Chyba v bloku

Pri chybe v päťvetovom alebo kumulatívnom úseku:

- pri `Neviem` systém zachová celý úsek, pretože nepozná presné miesto chyby,
- nesmie vytiahnuť jednu náhodnú vetu bez kontextu,
- po úspechu má pokračovať v pôvodnom poradí.

## Scénické poznámky

- poznámka v zátvorkách nesmie vytvoriť izolovanú učebnú úlohu,
- musí byť spojená s hovorenou vetou,
- pri skrytí hovoreného textu zostáva poznámka viditeľná,
- nápoveda počíta iba slová mimo zátvoriek.

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

## Scény

- parser rozpozná riadky `MENO: replika`, viacriadkové pokračovanie a samostatné poznámky v zátvorkách,
- scenár bez dvoch postáv alebo bez vybratej postavy sa neuloží,
- vlastné repliky idú v poradí a kolegove repliky zostávajú viditeľné,
- po dvoch nových vlastných replikách sa spustí kontrola doteraz naučenej časti,
- chyba alebo `Takmer` ponechá rovnaký krok a správne znenie je dostupné pred ďalším pokusom,
- záver aj jednodňová kontrola maskujú všetky vlastné repliky v celej scéne,
- relácia sa obnoví v režime čítania, vybavovania aj hodnotenia.

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
