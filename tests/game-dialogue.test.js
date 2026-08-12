import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichStudyUnitPrompts } from '../src/game-dialogue.js';

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
