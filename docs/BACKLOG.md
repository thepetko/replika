# Backlog

## Priorita P0 – stabilizácia prototypu

### Oddeliť logiku od UI

Stav: dokončené v prvom bezpečnom refaktore.

Presunúť parser, stavový automat a úložisko do samostatných modulov.

Akceptácia:

- rozhodovanie algoritmu sa dá testovať bez prehliadača,
- DOM vrstva iba vykresľuje aktuálnu úlohu a odosiela akcie.

### Pridať automatické testy stavového automatu

Stav: základné akceptačné scenáre sú automatizované; testy treba rozširovať pri každej zmene algoritmu.

Pokryť aspoň:

- jedna veta,
- dve vety,
- viac blokov,
- opakované `Neviem`,
- `Takmer` na prechode,
- koniec bloku,
- koniec celej repliky,
- návrat o krok.

### Opraviť a spresniť texty v UI

Stav: základné technické názvy fáz sú nahradené používateľskými pokynmi; ďalšie úpravy patria do priebežného používateľského testovania.

Používateľ nemá vidieť technické názvy režimov. Texty majú vysvetľovať iba aktuálnu úlohu.

### Uložiť rozpracovanú reláciu

Stav: dokončené vrátane lokálnej knižnice, migrácie starého textu a JSON backupu.

Do `localStorage` ukladať:

- pôvodný text,
- spracované vety a bloky alebo verziu parsera,
- aktuálny stav,
- históriu v rozumnom limite,
- čas posledného použitia.

Pri opätovnom otvorení ponúknuť jednoduché:

- `Pokračovať`
- `Začať odznova`

## Priorita P1 – praktická použiteľnosť

### Knižnica replík

Stav: dokončené v základnom lokálnom rozsahu.

Používateľ môže uložiť viac textov lokálne.

Minimálne polia:

- názov,
- voliteľne hra/scéna/postava,
- text,
- stav učenia,
- posledné otvorenie.

Rozhranie má zostať jednoduché.

### Ručné hranice blokov

Prázdny riadok už funguje ako hranica. Neskôr pridať jednoduché vizuálne rozdelenie alebo editor blokov bez povinného nastavovania.

### Kontext partnerovej repliky

Umožniť zadať krátky spúšťač pred vlastnou replikou.

Pri tréningu sa zobrazí ako kontext, ale vlastný text zostane skrytý.

Stav: zámerne odložené po produktovom audite.

### Lepšie nápovedy

Odporúčané poradie:

1. prvé písmená slov,
2. prvé 1 až 3 slová,
3. celý text.

Použitie nápovedy má byť zaznamenané ako signál neistoty, ale nemá trestať používateľa.

## Priorita P2 – rozšírenia

### Hlasová nahrávka

Nahrať používateľov pokus a umožniť prehratie. Bez automatického známkovania v prvej verzii.

### Jednoduché lokálne štatistiky

Stav: základ dokončený – čas dnes, 7/30 dní, celok a prehľad podľa replík. Slabé prechody zostávajú ďalším krokom.

Zobraziť iba užitočné veci:

- kde sa používateľ najčastejšie zasekáva,
- ktoré prechody potrebovali najviac pokusov,
- kedy bol text naposledy precvičený.

Vyhnúť sa gamifikácii a preplneným dashboardom.

### Import celého scenára

Až neskôr. Vyžaduje rozlíšenie postáv, scénických poznámok a vlastných replík.

## Zámerne mimo rozsahu

- náhodné kartičky s izolovanými vetami,
- povinný výber tréningového režimu,
- komplikované Anki intervaly,
- cloudový účet v ranej fáze,
- automatické hodnotenie hereckého výkonu,
- body, odznaky a levely bez jasnej vzdelávacej hodnoty.
