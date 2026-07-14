import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyUnknownResolutions,
  createPresenceScenes,
  fingerprintScript,
  normalizeScriptParagraphs,
  recommendStandaloneRehearsals
} from '../src/script-importer.js';

test('rozpozná nadpis, postavy, poznámku, viacriadkovú repliku a úvod s poznámkou', () => {
  const parsed = normalizeScriptParagraphs([
    { text: 'Prvé dejstvo', style: 'Heading 1' },
    { text: 'TULÁK (vchádza): Dobrý večer.', style: 'normal' },
    { text: 'Pokračovanie tej istej repliky.', style: 'normal' },
    { text: '(Iris sa usmeje.)', style: 'normal' },
    { text: 'IRIS: Vitaj.', style: 'normal' }
  ]);

  assert.deepEqual(parsed.speakers, ['TULÁK', 'IRIS']);
  assert.equal(parsed.entries[0].type, 'heading');
  assert.equal(parsed.entries[1].text, '(vchádza) Dobrý večer. Pokračovanie tej istej repliky.');
  assert.equal(parsed.entries[2].type, 'direction');
});

test('nejasný riadok sa dá bezpečne zmeniť na poznámku, priradiť alebo vynechať', () => {
  const parsed = normalizeScriptParagraphs([
    { text: 'A: Začínam.', style: '' },
    { text: '(prestávka)', style: '' },
    { text: 'Nejasný text bez mena', style: '' }
  ]);
  const unknown = parsed.unknowns[0];

  assert.equal(applyUnknownResolutions(parsed, { [unknown.id]: 'context' }, 'A').entries.at(-1).type, 'direction');
  assert.deepEqual(applyUnknownResolutions(parsed, { [unknown.id]: 'character' }, 'A').entries.at(-1), {
    type: 'speech', speaker: 'A', text: 'Nejasný text bez mena', sourceIndex: 2
  });
  assert.equal(applyUnknownResolutions(parsed, { [unknown.id]: 'skip' }, 'A').entries.length, 2);
});

test('rozdelí scénu pri krátkej pauze a zmene partnera v dialógu', () => {
  const parsed = normalizeScriptParagraphs([
    { text: 'Druhé dejstvo', style: 'Heading 1' },
    { text: 'TULÁK: Prvá moja replika.', style: '' },
    { text: 'CHROBÁK: Odpoveď.', style: '' },
    { text: 'TULÁK: Druhá moja replika.', style: '' },
    { text: 'CVRČEK: Krátky cudzí vstup.', style: '' },
    { text: 'MOTÝĽ: Začínam nový rozhovor.', style: '' },
    { text: 'TULÁK: Návrat k motýľovi.', style: '' }
  ]);
  const scenes = createPresenceScenes(parsed, 'TULÁK');

  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].title, 'Druhé dejstvo · TULÁK a CHROBÁK');
  assert.equal(scenes[1].title, 'Druhé dejstvo · TULÁK a MOTÝĽ');
  assert.doesNotMatch(scenes[0].text, /Krátky cudzí vstup/);
  assert.match(scenes[1].text, /MOTÝĽ: Začínam nový rozhovor/);
  assert.match(scenes[1].text, /TULÁK: Návrat k motýľovi/);
});

test('navrhne dlhú alebo štruktúrne náročnú vlastnú repliku iba raz', () => {
  const line = 'Toto je dlhá replika s mnohými slovami, ktorá pokračuje ďalej, aby mala dostatočný rozsah a obsahovala viac viet. Druhá veta je prerušovaná — a znovu sa vracia k rovnakému slovu slovo. Tretia veta uzatvára myšlienku.';
  const scenes = [{ ownLines: [{ type: 'speech', speaker: 'TULÁK', text: line, sourceIndex: 8 }, { type: 'speech', speaker: 'TULÁK', text: line, sourceIndex: 8 }] }];
  const candidates = recommendStandaloneRehearsals(scenes, 'TULÁK');

  assert.equal(candidates.length, 1);
  assert.ok(candidates[0].score >= 2);
  assert.ok(candidates[0].reasons.length >= 2);
});

test('odtlačok zdroja je stabilný pre rovnaký scenár', () => {
  const paragraphs = [{ text: 'A: Text.', style: '' }];
  assert.equal(fingerprintScript(paragraphs), fingerprintScript(paragraphs));
  assert.notEqual(fingerprintScript(paragraphs), fingerprintScript([{ text: 'A: Iný text.', style: '' }]));
});
