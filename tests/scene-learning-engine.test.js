import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneReviewSession, createSceneSession, getCurrentSceneTask, giveSceneHint, rateSceneTask } from '../src/scene-learning-engine.js';

const parsed = { entries: [
  { type: 'speech', speaker: 'PETER', text: 'Ahoj.' }, { type: 'speech', speaker: 'ANNA', text: 'Ahoj, Peter.' },
  { type: 'speech', speaker: 'PETER', text: 'Ideš?' }, { type: 'speech', speaker: 'ANNA', text: 'Áno, idem.' },
  { type: 'speech', speaker: 'PETER', text: 'Tak poď.' }, { type: 'speech', speaker: 'ANNA', text: 'Už idem.' }
] };

test('učí vlastné repliky v poradí a po dvoch spustí rastúcu kontrolu', () => {
  let session = createSceneSession(parsed, 'ANNA');
  assert.equal(getCurrentSceneTask(session).targetIndex, 1);
  session = rateSceneTask(session, 'good');
  assert.equal(getCurrentSceneTask(session).targetIndex, 3);
  session = rateSceneTask(session, 'good');
  assert.equal(getCurrentSceneTask(session).phase, 'checkpoint');
  assert.deepEqual(getCurrentSceneTask(session).learnedIndices, [1, 3]);
});

test('chyba ponechá rovnaký scenický krok a záver vyžaduje celú scénu', () => {
  let session = createSceneSession(parsed, 'ANNA');
  session = rateSceneTask(session, 'bad');
  assert.equal(getCurrentSceneTask(session).targetIndex, 1);
  session = rateSceneTask(session, 'good'); session = rateSceneTask(session, 'good');
  session = rateSceneTask(session, 'good');
  assert.equal(getCurrentSceneTask(session).targetIndex, 5);
  session = rateSceneTask(session, 'good');
  assert.equal(getCurrentSceneTask(session).phase, 'all');
});

test('jednodňová kontrola začne celou scénou skrytou', () => {
  const review = createSceneReviewSession(parsed, 'ANNA');
  assert.equal(getCurrentSceneTask(review).phase, 'all');
  assert.equal(getCurrentSceneTask(review).display, 'recall');
});

test('úspech s nápovedou neopustí aktuálnu repliku', () => {
  let session = createSceneSession(parsed, 'ANNA');
  session.state.display = 'recall';
  session = giveSceneHint(session);
  session = rateSceneTask(session, 'good');
  assert.equal(getCurrentSceneTask(session).targetIndex, 1);
  assert.deepEqual(getCurrentSceneTask(session).learnedIndices, []);
});
