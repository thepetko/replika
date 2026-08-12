import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureDailyTarget,
  extendDailyTarget,
  parseScriptDocument,
  scriptDailyPace,
  scriptProgress,
  setScriptFocus,
  setScriptSpeechLearned
} from '../src/script-game.js';

const paragraphs = [
  { text: 'ZO ŽIVOTA HMYZU', style: 'Title' },
  { text: 'PRVÉ DEJSTVO', style: 'Heading 1' },
  { text: '(Na čistinke.)', style: '' },
  { text: 'CHROBÁK: Kde si?', style: '' },
  { text: 'TULÁK: Tu som.', style: '' },
  { text: 'A stále čakám.', style: '' },
  { text: 'Nejasná poznámka bez značky', style: '' },
  { text: 'DRUHÉ DEJSTVO', style: 'Heading 1' },
  { text: 'TULÁK: Idem ďalej.', style: '' },
  { text: 'CHROBÁK: Počkaj!', style: '' },
  { text: 'TULÁK: Už nemôžem.', style: '' }
];

function makeGame(overrides = {}) {
  const script = parseScriptDocument(paragraphs);
  return {
    id: 'game', mode: 'script', title: 'Hra', character: 'TULÁK',
    deadline: '2026-08-15', daysOff: [], focusSectionId: null,
    script, dailyTargets: {}, ...overrides
  };
}

test('import zachová každý odsek presne raz a v pôvodnom poradí', () => {
  const script = parseScriptDocument(paragraphs);
  assert.equal(script.entries.length, paragraphs.length);
  assert.deepEqual(script.entries.map(entry => entry.sourceIndex), paragraphs.map((_, index) => index));
  assert.deepEqual(script.entries.map(entry => entry.rawText), paragraphs.map(item => item.text));
  assert.equal(new Set(script.entries.map(entry => entry.id)).size, paragraphs.length);
  assert.equal(script.entries[6].type, 'continuation');
  assert.equal(script.entries[6].ambiguous, true);
});

test('pokračovanie odseku zostane v jednej samostatnej replike postavy', () => {
  const script = parseScriptDocument(paragraphs);
  const own = script.speeches.filter(speech => speech.speaker === 'TULÁK');
  assert.equal(own.length, 3);
  assert.equal(own[0].text, 'Tu som.\nA stále čakám.\nNejasná poznámka bez značky');
  assert.equal(own[0].entryIds.length, 3);
});

test('oprava nejasného bloku nemení jeho pozíciu ani identitu', () => {
  const first = parseScriptDocument(paragraphs);
  const corrected = parseScriptDocument(paragraphs, {
    [first.entries[6].id]: { type: 'direction' }
  });
  assert.equal(corrected.entries[6].id, first.entries[6].id);
  assert.equal(corrected.entries[6].sourceIndex, 6);
  assert.equal(corrected.entries[6].type, 'direction');
  assert.equal(corrected.speeches.find(speech => speech.speaker === 'TULÁK').entryIds.length, 2);
});

test('replika s didaskáliou pri mene sa rozpozná a opis scény nevytvorí falošnú sekciu', () => {
  const script = parseScriptDocument([
    { text: 'DRUHÉ DEJSTVO', style: '' },
    { text: 'TULÁK (potkne sa a vstane): Kde to som?', style: '' },
    { text: 'Scéna predstavuje piesčitý kopček, na ktorom sa postavy pomaly rozostavia.', style: '' },
    { text: 'Tretie dejstvo', style: '' },
    { text: 'Epilóg', style: '' }
  ]);
  assert.equal(script.speeches[0].speaker, 'TULÁK');
  assert.equal(script.speeches[0].text, '(potkne sa a vstane) Kde to som?');
  assert.equal(script.entries[2].type, 'direction');
  assert.deepEqual(script.sections.map(section => section.title), ['Začiatok', 'DRUHÉ DEJSTVO', 'Tretie dejstvo', 'Epilóg']);
});

test('dnešný cieľ je chronologický, súvislý a po odškrtnutí sa sám nedoplní', () => {
  const game = makeGame();
  const target = ensureDailyTarget(game, '2026-08-12', '2026-08-12T08:00:00.000Z');
  const own = game.script.speeches.filter(speech => speech.speaker === 'TULÁK');
  assert.deepEqual(target.speechIds, own.slice(0, target.speechIds.length).map(speech => speech.id));
  const fixedIds = [...target.speechIds];
  fixedIds.forEach(id => setScriptSpeechLearned(game, id, '2026-08-12T09:00:00.000Z'));
  assert.deepEqual(ensureDailyTarget(game, '2026-08-12').speechIds, fixedIds);
});

test('pokračovanie pridá bezprostredne nasledujúcu chronologickú dávku', () => {
  const game = makeGame({ deadline: '2026-08-20' });
  const target = ensureDailyTarget(game, '2026-08-12');
  target.speechIds.forEach(id => setScriptSpeechLearned(game, id, '2026-08-12T09:00:00.000Z'));
  const before = [...target.speechIds];
  extendDailyTarget(game, '2026-08-12');
  const ownIds = game.script.speeches.filter(speech => speech.speaker === 'TULÁK').map(speech => speech.id);
  assert.deepEqual(game.dailyTargets['2026-08-12'].speechIds, ownIds.slice(0, game.dailyTargets['2026-08-12'].speechIds.length));
  assert.ok(game.dailyTargets['2026-08-12'].speechIds.length > before.length);
});

test('priorita dejstva nahradí iba nehotovú časť cieľa a zachová progres', () => {
  const game = makeGame({ deadline: '2026-08-20' });
  const target = ensureDailyTarget(game, '2026-08-12');
  const learnedId = target.speechIds[0];
  setScriptSpeechLearned(game, learnedId, '2026-08-12T09:00:00.000Z');
  const secondSection = game.script.sections[2];
  setScriptFocus(game, secondSection.id, '2026-08-12');
  const next = game.dailyTargets['2026-08-12'];
  assert.equal(game.script.speeches.find(speech => speech.id === learnedId).learnedAt, '2026-08-12T09:00:00.000Z');
  assert.equal(next.speechIds[0], learnedId);
  assert.ok(next.speechIds.slice(1).every(id => game.script.speeches.find(speech => speech.id === id).sectionId === secondSection.id));
});

test('tempo rešpektuje deadline, voľné dni a progres mimo cieľa', () => {
  const game = makeGame({ deadline: '2026-08-14', daysOff: ['2026-08-13'] });
  const before = scriptDailyPace(game, '2026-08-12');
  assert.equal(before.availableDays, 2);
  const last = game.script.speeches.filter(speech => speech.speaker === 'TULÁK').at(-1);
  setScriptSpeechLearned(game, last.id, '2026-08-12T07:00:00.000Z');
  const after = scriptDailyPace(game, '2026-08-12');
  assert.ok(after.remainingMinutes < before.remainingMinutes);
  assert.ok(after.requiredMinutes <= before.requiredMinutes);
  assert.deepEqual(scriptProgress(game), { learned: 1, total: 3, percent: 33 });
});
