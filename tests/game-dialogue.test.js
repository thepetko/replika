import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichStudyUnitPrompts, mergeStudyUnitProgress, setStudyUnitCompletion } from '../src/game-dialogue.js';

test('starší učebný úsek doplní plné repliky partnerov v poradí dialógu', () => {
  const units = [{ id: 'u1', order: 0, sceneTitle: 'Prvý obraz', text: 'Prídem.\nUž idem.', prompts: [{ cueSpeaker: 'VSTUP', cue: 'Vlastný nástup.', text: 'Prídem.\nUž idem.' }] }];
  const scenes = [{ title: 'Prvý obraz', entries: [
    { type: 'speech', speaker: 'PETER', text: 'Tak prídeš dnes večer?' },
    { type: 'speech', speaker: 'ANNA', text: 'Prídem.' },
    { type: 'speech', speaker: 'PETER', text: 'Tak sa poponáhľaj.' },
    { type: 'speech', speaker: 'ANNA', text: 'Už idem.' }
  ] }];
  assert.equal(enrichStudyUnitPrompts(units, scenes, 'ANNA'), true);
  assert.deepEqual(units[0].prompts.map(prompt => [prompt.cueSpeaker, prompt.cueFull, prompt.text]), [
    ['PETER', 'Tak prídeš dnes večer?', 'Prídem.'],
    ['PETER', 'Tak sa poponáhľaj.', 'Už idem.']
  ]);
});

test('rozdelený monológ dostane nový cue iba v prvej časti', () => {
  const units = [
    { id: 'a', order: 0, sceneTitle: 'Obraz', text: 'Prvá časť dlhej repliky.', prompts: [{ cueSpeaker: 'VSTUP', text: 'Prvá časť dlhej repliky.' }] },
    { id: 'b', order: 1, sceneTitle: 'Obraz', text: 'Druhá časť.', prompts: [{ cueSpeaker: 'VSTUP', text: 'Druhá časť.' }] }
  ];
  const scenes = [{ title: 'Obraz', entries: [
    { type: 'speech', speaker: 'B', text: 'Povedz mi to celé.' },
    { type: 'speech', speaker: 'A', text: 'Prvá časť dlhej repliky. Druhá časť.' }
  ] }];
  enrichStudyUnitPrompts(units, scenes, 'A');
  assert.equal(units[0].prompts[0].cueSpeaker, 'B'); assert.equal(units[1].prompts[0].cueSpeaker, 'POKRAČOVANIE');
});

test('oprava importu vymení cue a zachová progres učebných úsekov', () => {
  const completedAt = '2026-08-10T18:00:00.000Z';
  const existing = [{
    id: 'old-unit', order: 0, sceneTitle: 'Druhé dejstvo', section: 'Druhé dejstvo',
    text: 'Pozor! Dajte pozor!', completedAt, weak: true,
    prompts: [{ cueSpeaker: 'VSTUP', cue: 'Vlastný nástup.', text: 'Pozor! Dajte pozor!' }]
  }];
  const fresh = [{
    id: 'fresh-unit', order: 0, sceneTitle: 'Druhé dejstvo', section: 'Druhé dejstvo',
    text: 'Pozor! Dajte pozor!', completedAt: null, weak: false,
    prompts: [{ cueSpeaker: 'LUMOK', cue: '(objaví sa za ním) Aha!', cueFull: '(objaví sa za ním) Aha!', text: 'Pozor! Dajte pozor!' }]
  }];

  const repaired = mergeStudyUnitProgress(existing, fresh);

  assert.equal(repaired[0].id, 'old-unit');
  assert.equal(repaired[0].completedAt, completedAt);
  assert.equal(repaired[0].weak, true);
  assert.equal(repaired[0].prompts[0].cueSpeaker, 'LUMOK');
  assert.equal(repaired[0].prompts[0].cueFull, '(objaví sa za ním) Aha!');
});

test('označené chýbajúce cue sa ešte môže doplniť zo zachovanej scény', () => {
  const units = [{
    id: 'u1', order: 0, sceneTitle: 'Obraz', text: 'Pozor! Dajte pozor!',
    prompts: [{ cueSpeaker: 'CHÝBA CUE', cue: 'Partnerova replika sa v staršom importe neuložila.', cueMissing: true, text: 'Pozor! Dajte pozor!' }]
  }];
  const scenes = [{ title: 'Obraz', entries: [
    { type: 'speech', speaker: 'LUMOK', text: '(objaví sa za ním) Aha!' },
    { type: 'speech', speaker: 'TULÁK', text: 'Pozor! Dajte pozor!' }
  ] }];

  assert.equal(enrichStudyUnitPrompts(units, scenes, 'TULÁK'), true);
  assert.equal(units[0].prompts[0].cueSpeaker, 'LUMOK');
  assert.equal(units[0].prompts[0].cueMissing, undefined);
});

test('dokončenie sa zapíše do aktuálneho úseku podľa ID, nie do zastaranej referencie', () => {
  const games = [{ id: 'game-1', lockedPlans: {}, units: [{ id: 'unit-1', completedAt: null }, { id: 'unit-2', completedAt: null }] }];
  const completedAt = '2026-08-12T10:00:00.000Z';

  assert.equal(setStudyUnitCompletion(games, 'game-1', 'unit-1', completedAt, { date: '2026-08-14', unitIds: ['unit-1', 'unit-2'] }), true);
  assert.equal(games[0].units[0].completedAt, completedAt);
  assert.deepEqual(games[0].lockedPlans['2026-08-14'], ['unit-1', 'unit-2']);
  assert.equal(setStudyUnitCompletion(games, 'game-1', 'missing', completedAt), false);
});
