import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureDailyTarget,
  extendDailyTarget,
  parseScriptDocument,
  scriptDailyPace,
  scriptProgress,
  setScriptFocus,
  setScriptSpeechLearned,
  setScriptSpeechLearnedById,
  setScriptSpeechNoteById
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
    id: 'game', title: 'Hra', character: 'TULÁK',
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
  assert.equal(script.entries[6].ambiguous, false);
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

test('rozpozná bodku, samostatné meno, tabulátor aj meno s didaskáliou', () => {
  const script = parseScriptDocument([
    { text: 'I.', style: '' },
    { text: 'PERINBABA. To je zaujímavé.', style: '' },
    { text: 'ZUBATÁ.', style: '' },
    { text: 'Nestarnem, šéfka.', style: '' },
    { text: 'JAKUB\t(Dá Zubatej zaucho.)', style: '' },
    { text: 'PERINBABA (smeje sa) Chachacha!', style: '' },
    { text: 'KOMEDIANTKA Vraj chudobný nástroj!', style: '' }
  ]);

  assert.deepEqual(script.speakers, ['PERINBABA', 'ZUBATÁ', 'JAKUB', 'KOMEDIANTKA']);
  assert.equal(script.entries[0].type, 'heading');
  assert.equal(script.speeches[0].text, 'To je zaujímavé.');
  assert.equal(script.speeches[1].text, 'Nestarnem, šéfka.');
  assert.equal(script.speeches[2].text, '(Dá Zubatej zaucho.)');
  assert.equal(script.speeches[3].text, '(smeje sa) Chachacha!');
  assert.equal(script.speeches[4].text, 'Vraj chudobný nástroj!');
});

test('zoznam obsadenia nevytvorí postavu s názvom OBSADENIE', () => {
  const script = parseScriptDocument([
    { text: 'OBSADENIE:', style: '' },
    { text: 'Perinbaba\tAngelika H.', style: '' },
    { text: 'I.', style: '' },
    { text: 'PERINBABA. Začíname.', style: '' }
  ]);

  assert.deepEqual(script.speakers, ['PERINBABA']);
});

test('zjednotí drobné rozdiely v diakritike a medzerách v mene postavy', () => {
  const script = parseScriptDocument([
    { text: 'ZUBATÁ. Prvá replika.', style: '' },
    { text: 'ZUBATA. Druhá replika.', style: '' },
    { text: 'ANIČKA. Prvá replika.', style: '' },
    { text: 'AN IČKA. Druhá replika.', style: '' },
    { text: 'A toto nie je nová postava.', style: '' },
    { text: 'KONIEC\t', style: '' }
  ]);

  assert.deepEqual(script.speakers, ['ZUBATÁ', 'ANIČKA']);
  assert.equal(script.speeches.filter(speech => speech.speaker === 'ZUBATÁ').length, 2);
  assert.equal(script.speeches.filter(speech => speech.speaker === 'ANIČKA').length, 2);
});

test('rozpozná repliku aj s ručným zalomením riadka z Wordu', () => {
  const script = parseScriptDocument([
    { text: 'PERINBABA. Nikto lavínu neprežil - a tento mládenček ju\nprežil?', style: '' },
    { text: 'ZUBATÁ. Oháňam sa kosou s rovnakou vervou\nako predtým.', style: '' }
  ]);

  assert.deepEqual(script.speakers, ['PERINBABA', 'ZUBATÁ']);
  assert.equal(script.speeches[0].text, 'Nikto lavínu neprežil - a tento mládenček ju prežil?');
  assert.equal(script.speeches[1].text, 'Oháňam sa kosou s rovnakou vervou ako predtým.');
});

test('isté pokračovanie repliky nezobrazuje ako nejasný blok', () => {
  const script = parseScriptDocument([
    { text: 'PERINBABA. Pozri sa!', style: '' },
    { text: '(Ukazuje mu, ako sa hrá na organe.)', style: '' },
    { text: 'Toto sú blesky.', style: '' },
    { text: 'A toto hromy.', style: '' }
  ]);

  assert.equal(script.speeches[0].text, 'Pozri sa!\nToto sú blesky.\nA toto hromy.');
  assert.equal(script.entries[1].type, 'direction');
  assert.equal(script.entries[2].type, 'continuation');
  assert.equal(script.entries[2].ambiguous, false);
  assert.equal(script.entries[3].ambiguous, false);
});

test('známu postavu rozpozná bez oddeľovača aj s rozdelenou didaskáliou', () => {
  const script = parseScriptDocument([
    { text: 'JAKUB. Prvá replika.', style: '' },
    { text: 'JAKUB A prečo nie? Je to paráda.', style: '' },
    { text: 'ZUBATÁ. Prvá replika.', style: '' },
    { text: 'ZUBATÁ (preoblečená za komedianta sa vynorí', style: '' },
    { text: 'v ústrety) Vitajte, komedianti!', style: '' }
  ]);

  assert.equal(script.speeches[1].speaker, 'JAKUB');
  assert.equal(script.speeches[1].text, 'A prečo nie? Je to paráda.');
  assert.equal(script.speeches[3].speaker, 'ZUBATÁ');
  assert.equal(script.speeches[3].text, '(preoblečená za komedianta sa vynorí\nv ústrety) Vitajte, komedianti!');
  assert.equal(script.entries[4].ambiguous, false);
});

test('titulné údaje pred prvým obrazom nežiada ručne zaraďovať', () => {
  const script = parseScriptDocument([
    { text: 'Ľubomír Feldek', style: '' },
    { text: 'OBSADENIE:', style: '' },
    { text: 'Perinbaba\tAngelika H.', style: '' },
    { text: 'I.', style: '' },
    { text: 'Hudba, svetlo, Perinbaba je už na scéne.', style: '' },
    { text: 'Neoznačený blok v tele scenára', style: '' }
  ]);

  assert.equal(script.entries[0].ambiguous, false);
  assert.equal(script.entries[1].ambiguous, false);
  assert.equal(script.entries[2].ambiguous, false);
  assert.equal(script.entries[4].type, 'direction');
  assert.equal(script.entries[4].ambiguous, false);
  assert.equal(script.entries[5].ambiguous, true);
});

test('skupinové meno s malým a priradí známej postave alebo scénickej poznámke', () => {
  const script = parseScriptDocument([
    { text: 'MACOCHA A DORA. Spievajú spolu.', style: '' },
    { text: 'MACOCHA a DORA (vyliezajú z orchestriska a spievajú).', style: '' },
    { text: 'Ach, Perinbaba!', style: '' },
    { text: 'JAKUB. Prichádza.', style: '' },
    { text: 'JAKUB a ANIČKA (vo svadobnom).', style: '' }
  ]);

  assert.equal(script.speeches[1].speaker, 'MACOCHA A DORA');
  assert.equal(script.speeches[1].text, '(vyliezajú z orchestriska a spievajú).\nAch, Perinbaba!');
  assert.equal(script.entries[4].type, 'direction');
  assert.equal(script.entries[4].ambiguous, false);
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

test('označenie podľa ID zapisuje do aktuálnej kópie dát aj po automatickom uložení', () => {
  const staleGame = makeGame();
  const currentGames = structuredClone([staleGame]);
  const speechId = staleGame.script.speeches.find(speech => speech.speaker === 'TULÁK').id;

  const changed = setScriptSpeechLearnedById(currentGames, staleGame.id, speechId, '2026-08-12T09:00:00.000Z');

  assert.equal(changed, true);
  assert.equal(currentGames[0].script.speeches.find(speech => speech.id === speechId).learnedAt, '2026-08-12T09:00:00.000Z');
  assert.equal(staleGame.script.speeches.find(speech => speech.id === speechId).learnedAt, null);
});

test('poznámka podľa ID sa uloží iba k vlastnej replike v aktuálnej kópii dát', () => {
  const staleGame = makeGame();
  const currentGames = structuredClone([staleGame]);
  const ownSpeech = staleGame.script.speeches.find(speech => speech.speaker === 'TULÁK');
  const partnerSpeech = staleGame.script.speeches.find(speech => speech.speaker === 'CHROBÁK');

  assert.equal(setScriptSpeechNoteById(currentGames, staleGame.id, ownSpeech.id, '  Vstať a prejsť doprava.  '), true);
  assert.equal(setScriptSpeechNoteById(currentGames, staleGame.id, partnerSpeech.id, 'Nemá sa uložiť.'), false);
  assert.equal(currentGames[0].script.speeches.find(speech => speech.id === ownSpeech.id).note, 'Vstať a prejsť doprava.');
  assert.equal(staleGame.script.speeches.find(speech => speech.id === ownSpeech.id).note, '');
});
