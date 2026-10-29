import test from 'node:test';
import assert from 'node:assert/strict';
import { isWordToken, splitMemorizerLines, splitMemorizerTokens, visiblePrefix } from '../src/memorizer.js';
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
