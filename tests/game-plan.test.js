import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDates, buildSchedule } from '../src/game-plan.js';
import { createStudyUnits, splitUnit, mergeUnitWithNext } from '../src/game-segments.js';

const units = [{ id: 'a', text: 'A', minutes: 10 }, { id: 'b', text: 'B', minutes: 10 }, { id: 'c', text: 'C', minutes: 10 }];
test('plán rozdelí zostávajúce úseky medzi dni', () => {
  const plan = buildSchedule(units, { start: '2026-08-10', deadline: '2026-08-12' });
  assert.equal(plan.dates.length, 3); assert.equal(Object.values(plan.schedule).flat().length, 3);
});
test('voľný deň sa vylúči a hotový úsek sa neplánuje', () => {
  assert.deepEqual(availableDates('2026-08-10', '2026-08-12', ['2026-08-11']), ['2026-08-10', '2026-08-12']);
  const plan = buildSchedule([{ ...units[0], completedAt: '2026-08-10' }, units[1]], { start: '2026-08-10', deadline: '2026-08-11' });
  assert.equal(Object.values(plan.schedule).flat().length, 1);
});
test('plán označí termín bez dostupného dňa ako nemožný', () => {
  assert.equal(buildSchedule(units, { start: '2026-08-10', deadline: '2026-08-10', daysOff: ['2026-08-10'] }).impossible, true);
});
test('úseky spájajú krátke vstupy a dlhý text možno rozdeliť i znovu spojiť', () => {
  const scenes = [{ title: 'I. dejstvo', section: 'I. dejstvo', ownLines: [{ text: 'Áno.' }, { text: 'Prídem hneď.' }, { text: 'Jedna. Dve. Tri. Štyri. Päť. Šesť. Sedem. Osem. Deväť. Desať. Jedenásť. Dvanásť.' }] }];
  let i = 0; const id = () => `u${++i}`; const created = createStudyUnits(scenes, 'A', id);
  assert.ok(created.length >= 2); const split = splitUnit([{ ...created.at(-1), text: 'Jedna veta. Druhá veta. Tretia veta.' }], created.at(-1).id, id);
  assert.ok(split.length >= 1); assert.equal(mergeUnitWithNext(created, created[0].id).length, created.length - 1);
});
