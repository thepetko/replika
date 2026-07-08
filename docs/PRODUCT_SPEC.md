# Produktová špecifikácia

## Problém

Herec potrebuje zvládnuť veľké množstvo súvislého textu. Bežné opakované čítanie je pasívne, zatiaľ čo kartičkový systém rozbíja kontext a poradie textu.

Cieľom je vytvoriť jednoduchého trénera, ktorý:

- vedie používateľa krok za krokom,
- podporuje aktívne vybavovanie z pamäti,
- zachováva kontext a poradie,
- automaticky prispôsobuje veľkosť precvičovaného úseku,
- nezaťažuje používateľa výberom režimu alebo metodiky.

## Primárny používateľský tok

1. Používateľ vloží jednu repliku alebo monológ.
2. Nástroj rozdelí text na vety a prirodzené bloky.
3. Zobrazí jednu vetu.
4. Používateľ ju skryje a povie nahlas.
5. Odkryje správne znenie.
6. Označí výsledok:
   - `Neviem`
   - `Takmer`
   - `Viem`
7. Nástroj automaticky:
   - zopakuje vetu v kontexte,
   - precvičí prechod medzi vetami,
   - spojí viac viet do bloku,
   - alebo pokračuje ďalej.
8. Na konci sa precvičí celá replika.

## Nevyjednateľné UX zásady

### 1. Žiadne náhodné izolované vety

Problematic­ká veta sa nesmie neskôr objaviť sama bez kontextu.

Povolené je napríklad:

- predchádzajúca veta + problémová veta,
- krátky blok okolo chyby,
- celý významový blok,
- celá replika.

### 2. Minimum rozhodnutí

Používateľ nemá vyberať:

- režim učenia,
- vhodnú veľkosť bloku,
- algoritmus opakovania,
- typ tréningu.

Systém má vybrať nasledujúci krok automaticky.

### 3. Jeden jasný najbližší krok

Rozhranie má vždy jasne hovoriť, čo má používateľ teraz urobiť.

### 4. Jednoduchosť pred množstvom funkcií

Nová funkcia je vhodná iba vtedy, keď:

- skracuje cestu k naučeniu textu,
- nevyžaduje štúdium ovládania,
- nenarušuje súvislosť textu.

### 5. Mobilná a zrakovo prístupná použiteľnosť

Dôležité sú:

- veľký text,
- vysoký kontrast,
- veľké dotykové plochy,
- jednoduchá štruktúra,
- použiteľnosť pri zväčšení stránky,
- zmysluplné popisy pre čítačku obrazovky.

## Funkcie súčasného prototypu

- lokálna knižnica viacerých replík,
- názov a voliteľné údaje hra, postava a scéna,
- vloženie textu,
- vloženie zo schránky,
- delenie na vety,
- prázdny riadok ako hranica bloku,
- skrytie a odkrytie textu,
- dvojúrovňová nápoveda,
- sebahodnotenie,
- automatické fázy:
  - nová veta,
  - prechod,
  - blok,
  - celá replika,
- návrat o krok,
- zopakovanie aktuálneho úseku,
- uloženie lokálnej knižnice do `localStorage`,
- presné uloženie a obnovenie rozpracovanej relácie,
- JSON export a úplná obnova lokálnych dát,
- čas viditeľnej aplikácie a obrazovka Pokrok,
- jednodňová kontrola dokončenej repliky,
- ovládanie klávesnicou.

## Dlhodobejší smer

Nástroj môže neskôr podporovať:

- viac uložených replík,
- názov hry, scény a postavy,
- repliku partnera ako spúšťač,
- manuálne hranice významových blokov,
- hlasovú nahrávku používateľa,
- pokračovanie rozpracovaného učenia,
- lokálne štatistiky slabých prechodov,
- import štruktúrovaného scenára.

Tieto funkcie nesmú zmeniť aplikáciu na komplikovaný systém nastavení.
