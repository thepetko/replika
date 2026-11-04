import test from 'node:test';
import assert from 'node:assert/strict';
import { isWordToken, splitMemorizerLines, splitMemorizerTokens, visiblePrefix, visibleWordHint } from '../src/memorizer.js';
import { createBackup, createEmptyAppData, validateBackup } from '../src/storage.js';

test('memorovanie zachová riadky, medzery a diakritiku', () => {
  assert.deepEqual(splitMemorizerLines('  Škáročka od\n\n stebla k steblu  '), ['Škáročka od', 'stebla k steblu']);
  assert.deepEqual(splitMemorizerTokens('Škáročka  od'), ['Škáročka', '  ', 'od']);
  assert.equal(visiblePrefix('Škáročka', 3), 'Šká');
  assert.equal(isWordToken('  '), false);
  assert.equal(isWordToken('Škáročka!'), true);
});

test('samostatný text sa prenesie v úplnej zálohe', () => {
  const data = createEmptyAppData();
  data.memorizerDraft = 'Do zbrane!';
  const backup = createBackup(data);
  assert.equal(validateBackup(backup).data.memorizerDraft, 'Do zbrane!');
});

test('nápoveda po slovách rozkladá viditeľné slová po celej replike', () => {
  const indices = Array.from({ length: 12 }, (_, index) => index);
  assert.deepEqual(indices.filter(index => visibleWordHint(index, 25)), [0, 4, 8]);
  assert.deepEqual(indices.filter(index => visibleWordHint(index, 50)), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(indices.filter(index => visibleWordHint(index, 75)), [0, 1, 2, 4, 5, 6, 8, 9, 10]);
});
