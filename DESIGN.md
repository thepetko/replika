# Replika Design System

<!-- impeccable:design-system-schema 1 -->

## Vizuálna téza

Replika pôsobí ako súčasná pracovná pomôcka pre herca: čistý javiskový papier, presná typografia a minimum dekorácie. Rozhranie musí zostať pokojné aj pri dlhom scenári. Logo je nemenný hlavný identifikačný prvok.

## Farby

- `Ivory #FAF8F5` – hlavné pozadie aplikácie.
- `Paper #F2EEE8` – sekundárne plochy, navigácia a pokojné stavy.
- `Warm Beige #E9E3D7` – masky replík a jemné zvýraznenia.
- `Stone #DAD5C8` – deliace čiary, okraje a neaktívne prvky.
- `Charcoal #111111` – text a primárne akcie.
- `Gray #6B6B6B` – pomocný text.
- `Accent Gold #D4B98C` – progres, dnešný cieľ a aktívny učebný stav. Nepoužíva sa dekoratívne.
- `Danger #9F2F2F` – chyby a deštruktívne akcie.

## Typografia

- Display a dramatický text: `Playfair Display`, potom `Georgia`, serif.
- Rozhranie: `Inter`, potom `Arial`, system-ui, sans-serif.
- H1: serif, 44–52 px na veľkej obrazovke, 36–42 px na mobile, mierne záporný tracking.
- H2: serif, 20–28 px.
- Bežný text: 16 px / 24 px. Caption: 12 px / 16 px.
- Malé nadpisy môžu používať uppercase s trackingom `0.08em`; nie pri každej sekcii.

## Komponenty

- Primárne tlačidlo je čierne, kompaktné a pilulkové; sekundárne je biele s 1 px okrajom; ghost nemá plochu.
- Formuláre majú bielu plochu, 1 px Stone okraj a 8–12 px rádius.
- Karty používajú rádius 12–16 px, jemný nízky tieň a žiadny dvojitý efekt okraja s výrazným tieňom.
- Pill tabs majú Paper podklad a čierny aktívny stav.
- Progres je tenká Stone dráha so zlatou výplňou.
- Checkbox používa čierny alebo zlatý aktívny stav; reaguje iba na priamu interakciu.

## Rozloženie a rytmus

- Základný rytmus je 8 px. Bežné medzery: 8, 16, 24, 32, 48 a 64 px.
- Obsah aplikácie má maximálnu šírku približne 1120 px, čítaný scenár 65–72 znakov.
- Viac priestoru patrí nad nadpis než pod neho. Súvisiace ovládacie prvky zostávajú tesne pri sebe.
- Na mobile sa kompozícia skladá do jedného stĺpca bez horizontálneho posunu; dotykové plochy majú aspoň 44 px.

## Pohyb

- Pohyb potvrdzuje zmenu stavu, najmä označenie `Viem` a otvorenie obrazovky.
- Používa krátke 160–240 ms ease-out prechody. Pri `prefers-reduced-motion` sa animácia odstráni.

## Prístupnosť

- Bežný text a ovládanie musia spĺňať kontrast 4.5 : 1.
- Focus ring je jasne viditeľný v zlatej farbe s tmavým vonkajším okrajom.
- Farba nikdy nie je jediným nositeľom stavu.
