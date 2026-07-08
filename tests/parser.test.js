import test from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/parser.js';

test('rozdelí jednoduchý text na vety v jednom bloku', () => {
  const parsed = parseText('Prišiel som domov. Nikto tam nebol. Prečo si odišiel?');

  assert.deepEqual(parsed.sentences, [
    'Prišiel som domov.',
    'Nikto tam nebol.',
    'Prečo si odišiel?'
  ]);
  assert.deepEqual(parsed.blocks, [{ start: 0, end: 2 }]);
});

test('prázdny riadok vytvorí hranicu bloku', () => {
  const parsed = parseText('Prvá veta. Druhá veta.\n\nTretia veta. Štvrtá veta.');

  assert.equal(parsed.sentences.length, 4);
  assert.deepEqual(parsed.blocks, [
    { start: 0, end: 1 },
    { start: 2, end: 3 }
  ]);
});

test('jednoduché zalomenie bez interpunkcie vetu nestratí ani nerozdelí', () => {
  const parsed = parseText('Toto je prvý riadok\na toto je jeho pokračovanie.');

  assert.deepEqual(parsed.sentences, [
    'Toto je prvý riadok a toto je jeho pokračovanie.'
  ]);
});

test('zachová koncovú úvodzovku, viacbodku a kombinovanú interpunkciu', () => {
  const parsed = parseText('„Naozaj?“ spýtal sa. Počkaj... Čože?!');

  assert.deepEqual(parsed.sentences, [
    '„Naozaj?“',
    'spýtal sa.',
    'Počkaj...',
    'Čože?!'
  ]);
});

test('bežná skratka nevytvorí samostatnú vetu', () => {
  const parsed = parseText('Prišiel p. Novák. Potom odišiel.');

  assert.deepEqual(parsed.sentences, [
    'Prišiel p. Novák.',
    'Potom odišiel.'
  ]);
});

test('prázdny text vráti prázdny výsledok', () => {
  assert.deepEqual(parseText('  \n\n '), { sentences: [], blocks: [] });
});

test('text bez koncovej interpunkcie zostane jednou vetou', () => {
  assert.deepEqual(parseText('Byť či nebyť'), {
    sentences: ['Byť či nebyť'],
    blocks: [{ start: 0, end: 0 }]
  });
});
