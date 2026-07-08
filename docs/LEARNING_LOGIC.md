# Logika učenia

## Architektúra

Rozhodovanie je oddelené od DOM v `src/learning-engine.js`. Modul nepristupuje k prehliadaču, času ani náhode. Rovnaký vstupný stav a akcia preto vždy vytvoria rovnaký výsledok.

Hlavné rozhranie:

```js
const session = createSession(parsedText);
const task = getCurrentTask(session);
const nextSession = rateCurrentTask(session, 'good');
```

Funkcie nemenia odovzdanú reláciu. Vracajú jej novú kópiu, čo umožňuje presné testy a bezpečný návrat o krok.

## Dátový model

Relácia obsahuje:

```js
{
  sentences: [],
  blocks: [],
  status: 'active' | 'done',
  state: {
    phase: 'learn' | 'bridge' | 'block' | 'checkpoint' | 'all',
    current: 0,
    knownEnd: -1,
    segmentStart: 0,
    segmentEnd: 0,
    display: 'study' | 'recall' | 'rate',
    hintLevel: 0,
    usedHint: false,
    retries: 0,
    lastRating: null
  },
  history: []
}
```

História uchováva najviac 50 predchádzajúcich stavov.

## Interné fázy

- `learn` – jedna nová veta,
- `bridge` – krátky prechod medzi susednými vetami,
- `block` – posuvný súvislý úsek najviac piatich viet,
- `checkpoint` – kumulatívna kontrola doteraz naučenej časti,
- `all` – celá replika.

Používateľ fázu nevyberá. Rozhranie ju prekladá na jednoduchý pokyn pre aktuálny krok.

## Rozhodovacia politika

### `Viem`

- Po prvej vete sa pokračuje ďalšou vetou.
- Po ďalšej novej vete sa preverí prechod s bezprostredne predchádzajúcou vetou.
- Po troch vetách alebo na prirodzenom konci bloku sa preverí súvislý úsek najviac posledných piatich viet.
- Po každej piatej novej vete sa preverí doteraz naučená časť od začiatku.
- Hranica bloku nezruší sekvenčný kontext: prvá veta nového bloku sa spojí s poslednou vetou predchádzajúceho bloku.
- Po poslednom bloku sa preverí celá replika.
- Jednovetová replika prejde po prvom úspechu priamo na záverečné preverenie celej repliky.

### `Takmer`

- Pri novej vete sa zachová krátky prechod s predchádzajúcou vetou.
- Krátky prechod sa nemení.
- Dlhší úsek sa skráti o najstaršiu vetu, ale zachová pôvodné poradie.
- `Viem` po použitej nápovede sa interne spracuje ako `Takmer`.

### `Neviem`

- Pri novej vete sa zobrazí spolu s bezprostredne predchádzajúcou vetou, ak existuje.
- Pri bloku alebo celej replike sa zachová celý úsek, pretože aplikácia nepozná presné miesto chyby.
- Systém nikdy nevyberá náhodnú vetu ani nemení poradie textu.

## Kontrola na nasledujúci deň

Po prvom dokončení dostane replika termín na nasledujúci miestny deň. Kontrola začne celou replikou skrytou. Úspech ju označí ako overenú; `Takmer` alebo `Neviem` ponechá celú repliku na ďalší pokus.

## Parser

`src/parser.js` zachováva prázdny riadok ako hranicu prirodzeného bloku. Jednoduché zalomenie riadka bez interpunkcie spojí medzerou, takže text nestratí. Parser podporuje koncové úvodzovky, viacbodku, kombinované otázniky a výkričníky a malú množinu bežných skratiek.

Text uzavretý v zátvorkách sa považuje za scénickú poznámku. Samostatná poznámka sa pripojí k nasledujúcej hovorenej vete; ak je na konci textu, k predchádzajúcej. Pri vybavovaní z pamäti zostane poznámka viditeľná a maskujú sa iba hovorené slová.

Parser nie je plnohodnotný jazykový analyzátor. Menej bežné skratky, vnorené zátvorky a neštandardná interpunkcia zostávajú otvorenými prípadmi.

## Známe limity

1. `knownEnd` stále vyjadruje lineárne pokrytie, nie mieru dlhodobého zvládnutia.
2. Pri chybe v dlhom úseku aplikácia nevie, na ktorej konkrétnej vete sa používateľ pomýlil; bezpečne vyberie koncový prechod.
3. Päťvetové okno je pevná konzervatívna heuristika; aplikácia zatiaľ nemá editor významových hraníc.
4. Zmena parserovej verzie automaticky neprepisuje už rozpracovanú reláciu. Nové spracovanie sa použije po začatí odznova.
