import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReviewSession,
  createSession,
  giveHint,
  getCurrentTask,
  goBack,
  rateCurrentTask,
  repeatCurrentTask
} from '../src/learning-engine.js';

function parsed(count, blocks = [{ start: 0, end: count - 1 }]) {
  return {
    sentences: Array.from({ length: count }, (_, index) => `Veta ${index + 1}.`),
    blocks
  };
}

function rate(session, rating = 'good') {
  return rateCurrentTask(session, rating);
}

function advanceUntil(session, predicate, limit = 100) {
  let current = session;
  for (let step = 0; step < limit; step += 1) {
    const task = getCurrentTask(current);
    if (task && predicate(task)) return current;
    current = rate(current);
  }
  throw new Error('Hľadaný stav sa v limite krokov nenašiel.');
}

test('jedna veta prejde cez celú repliku až do konca', () => {
  let session = createSession(parsed(1));
  assert.equal(getCurrentTask(session).phase, 'learn');

  session = rate(session);
  assert.equal(getCurrentTask(session).phase, 'all');

  session = rate(session);
  assert.equal(session.status, 'done');
});

test('dve vety sa učia v poradí a preveria ako blok', () => {
  let session = createSession(parsed(2));
  assert.deepEqual(getCurrentTask(session).range, { start: 0, end: 0 });

  session = rate(session);
  assert.deepEqual(getCurrentTask(session).range, { start: 1, end: 1 });

  session = rate(session);
  assert.deepEqual(getCurrentTask(session).range, { start: 0, end: 1 });
  assert.equal(getCurrentTask(session).phase, 'block');
});

test('po troch nových vetách preverí rastúci blok', () => {
  let session = createSession(parsed(5));
  session = rate(session); // veta 2
  session = rate(session); // prechod 1-2
  assert.deepEqual(getCurrentTask(session).range, { start: 0, end: 1 });
  session = rate(session); // veta 3
  assert.deepEqual(getCurrentTask(session).range, { start: 2, end: 2 });
  session = rate(session); // blok 1-3

  assert.equal(getCurrentTask(session).phase, 'block');
  assert.deepEqual(getCurrentTask(session).range, { start: 0, end: 2 });
});

test('dlhá replika strieda päťvetové okno s kumulatívnou kontrolou', () => {
  let session = createSession(parsed(12));
  session = advanceUntil(session, task => task.phase === 'checkpoint' && task.range.end === 4);
  assert.deepEqual(getCurrentTask(session).range, { start: 0, end: 4 });

  session = rate(session);
  session = advanceUntil(session, task => task.phase === 'block' && task.range.end === 5);
  assert.deepEqual(getCurrentTask(session).range, { start: 1, end: 5 });

  session = rate(session);
  session = advanceUntil(session, task => task.phase === 'checkpoint' && task.range.end === 9);
  assert.deepEqual(getCurrentTask(session).range, { start: 0, end: 9 });
});

test('piata veta spustí kumulatívnu kontrolu aj za hranicou bloku', () => {
  const session = advanceUntil(
    createSession(parsed(7, [
      { start: 0, end: 3 },
      { start: 4, end: 6 }
    ])),
    task => task.phase === 'checkpoint' && task.range.end === 4
  );

  assert.deepEqual(getCurrentTask(session).range, { start: 0, end: 4 });
});

test('opakované Neviem zachová problémovú vetu s dostupným kontextom', () => {
  let session = createSession(parsed(5));
  session = rate(session); // veta 2
  session = rate(session); // prechod
  session = rate(session); // veta 3
  session = rate(session); // blok 1-3
  session = rate(session); // veta 4

  session = rate(session, 'bad');
  let task = getCurrentTask(session);
  assert.equal(task.phase, 'bridge');
  assert.deepEqual(task.range, { start: 2, end: 3 });

  session = rate(session, 'bad');
  task = getCurrentTask(session);
  assert.deepEqual(task.range, { start: 2, end: 3 });
  assert.match(task.text, /Veta 4\./);
});

test('Takmer na prechode ponechá krátky sekvenčný kontext', () => {
  let session = createSession(parsed(3));
  session = rate(session);
  session = rate(session);
  const before = getCurrentTask(session);

  session = rate(session, 'almost');
  const after = getCurrentTask(session);

  assert.equal(after.phase, 'bridge');
  assert.deepEqual(after.range, before.range);
});

test('hranica bloku zachová prechod z predchádzajúceho bloku', () => {
  let session = createSession(parsed(4, [
    { start: 0, end: 1 },
    { start: 2, end: 3 }
  ]));
  session = rate(session); // veta 2
  session = rate(session); // blok 1-2
  session = rate(session); // veta 3
  session = rate(session); // prechod cez hranicu blokov

  assert.equal(getCurrentTask(session).phase, 'bridge');
  assert.deepEqual(getCurrentTask(session).range, { start: 1, end: 2 });
});

test('po poslednom bloku nasleduje celá replika a koniec', () => {
  let session = createSession(parsed(2));
  session = rate(session);
  session = rate(session);
  session = rate(session);

  assert.equal(getCurrentTask(session).phase, 'all');
  session = rate(session);
  assert.equal(session.status, 'done');
});

test('Krok späť obnoví stav pred posledným hodnotením', () => {
  const initial = createSession(parsed(2));
  const advanced = rate(initial);
  const restored = goBack(advanced);

  assert.deepEqual(getCurrentTask(restored), getCurrentTask(initial));
  assert.equal(initial.history.length, 0, 'pôvodný stav sa nesmie zmeniť');
});

test('Zopakovať aktuálny úsek nemení poradie viet', () => {
  let session = createSession(parsed(3));
  session = rate(session);
  session = repeatCurrentTask(session);

  assert.deepEqual(getCurrentTask(session).range, { start: 0, end: 1 });
  assert.equal(getCurrentTask(session).text, 'Veta 1. Veta 2.');
});

test('neplatné hodnotenie je odmietnuté', () => {
  assert.throws(
    () => rateCurrentTask(createSession(parsed(1)), 'výborne'),
    /Neplatné hodnotenie/
  );
});

test('Viem po nápovede sa spracuje ako Takmer', () => {
  let session = createSession(parsed(2));
  session.state.display = 'recall';
  session = giveHint(session);
  session = rateCurrentTask(session, 'good');

  assert.equal(session.state.current, 0);
  assert.equal(session.state.lastRating, 'good');
  assert.equal(session.state.lastEffectiveRating, 'almost');
  assert.equal(session.state.lastAttemptAssisted, true);
});

test('Neviem v bloku zachová celý pôvodný kontext', () => {
  let session = createSession(parsed(3));
  session = rate(session);
  session = rate(session);
  session = rate(session);
  session = rate(session);
  assert.equal(getCurrentTask(session).phase, 'block');
  const before = getCurrentTask(session).range;

  session = rate(session, 'bad');

  assert.equal(getCurrentTask(session).phase, 'block');
  assert.deepEqual(getCurrentTask(session).range, before);
});

test('jednodňová kontrola začne celou replikou skrytou', () => {
  const review = createReviewSession(parsed(3));
  const task = getCurrentTask(review);

  assert.equal(review.kind, 'review');
  assert.equal(task.phase, 'all');
  assert.equal(task.display, 'recall');
  assert.deepEqual(task.range, { start: 0, end: 2 });
});

test('neúspešná jednodňová kontrola ponechá celú repliku', () => {
  let review = createReviewSession(parsed(3));
  review = rateCurrentTask(review, 'bad');

  assert.equal(review.status, 'active');
  assert.equal(getCurrentTask(review).phase, 'all');
  assert.deepEqual(getCurrentTask(review).range, { start: 0, end: 2 });
});
