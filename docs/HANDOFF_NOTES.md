# Poznámky k odovzdaniu

## Aktuálny stav

Aplikácia má lokálnu knižnicu viacerých replík, obnovuje presný stav rozpracovanej relácie a zaznamenáva čas viditeľného používania. Rozhodovacia logika je čistá a pokrytá automatickými testmi. Parser stále nemusí správne vyriešiť všetky neobvyklé jazykové hraničné prípady.

Spúšťa sa dvojklikovým spúšťačom alebo cez jednoduchý lokálny server podľa `README.md`; nevyžaduje build proces.

## Najdôležitejšie očakávanie používateľa

Používateľ chce nástroj jednoducho zapnúť, vložiť text a používať ho.

Nechce rozmýšľať:

- ktorý režim zvoliť,
- koľko viet má mať blok,
- kedy má zopakovať text,
- či je zvolená metodika správna.

Automatizácia rozhodovania je preto súčasťou produktu, nie voliteľný doplnok.

## Jazyk

Používateľské rozhranie a používateľská dokumentácia majú byť po slovensky. Technické názvy v kóde môžu byť po anglicky.
