import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScene, validateScene } from '../src/scene-parser.js';

test('spracuje postavy, viacriadkovú repliku a poznámku', () => {
  const parsed = parseScene('ANNA: Prídem hneď.\nLen ešte niečo dokončím.\n(Obzrie sa.)\nPETER: Čakám.');
  assert.deepEqual(parsed.speakers, ['ANNA', 'PETER']);
  assert.equal(parsed.entries[0].text, 'Prídem hneď. Len ešte niečo dokončím.');
  assert.equal(parsed.entries[1].stageDirection, '(Obzrie sa.)');
  assert.equal(parsed.errors.length, 0);
  assert.doesNotThrow(() => validateScene(parsed, 'ANNA'));
});

test('odmietne nejednoznačný scenár a chýbajúcu postavu', () => {
  const parsed = parseScene('Toto nie je scenár.');
  assert.ok(parsed.errors.length);
  assert.throws(() => validateScene(parseScene('A: Ahoj\nB: Čau'), 'C'), /Vyber postavu/);
});
