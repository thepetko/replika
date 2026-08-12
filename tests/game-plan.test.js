import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDates, buildSchedule, reviewUnitsForDate, unitWeight } from '../src/game-plan.js';
import { createStudyUnits, splitUnit, mergeUnitWithNext } from '../src/game-segments.js';

const units = [{ id: 'a', text: 'A', minutes: 10 }, { id: 'b', text: 'B', minutes: 10 }, { id: 'c', text: 'C', minutes: 10 }];
test('plán rozdelí zostávajúce úseky medzi dni', () => {
  const plan = buildSchedule(units, { start: '2026-08-10', deadline: '2026-08-12' });
  assert.equal(plan.dates.length, 3); assert.equal(Object.values(plan.schedule).flat().length, 3);
});
test('plán vždy zachová chronologické poradie podľa order', () => {
  const plan = buildSchedule([
    { id: 'záver', text: 'Záver', minutes: 10, order: 2 },
    { id: 'úvod', text: 'Úvod', minutes: 10, order: 0 },
    { id: 'stred', text: 'Stred', minutes: 10, order: 1 }
  ], { start: '2026-08-10', deadline: '2026-08-12' });
  assert.deepEqual(Object.values(plan.schedule).flat().map(unit => unit.id), ['úvod', 'stred', 'záver']);
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
test('uzamknutý dnešok sa po dokončení nedoplní ďalším úsekom', () => {
  const plan = buildSchedule([{ ...units[0], completedAt: '2026-08-10T10:00:00' }, units[1], units[2]], { start: '2026-08-10', deadline: '2026-08-12', lockedPlans: { '2026-08-10': ['a'] } });
  assert.deepEqual(plan.schedule['2026-08-10'], []);
  assert.deepEqual(Object.values(plan.schedule).flat().map(unit => unit.id), ['b', 'c']);
});
test('dokončený budúci deň sa znovu nenaplní nasledujúcou replikou', () => {
  const completed = (id, order) => ({ id, order, text: id, minutes: 10, completedAt: '2026-08-10T10:00:00' });
  const plan = buildSchedule([
    completed('A', 0), completed('B', 1), completed('C', 2), completed('D', 3),
    { id: 'E', order: 4, text: 'E', minutes: 10 }, { id: 'F', order: 5, text: 'F', minutes: 10 }
  ], {
    start: '2026-08-10', deadline: '2026-08-12',
    lockedPlans: { '2026-08-10': ['A', 'B'], '2026-08-11': ['C', 'D'] }
  });
  assert.deepEqual(plan.schedule['2026-08-11'], []);
  assert.deepEqual(plan.schedule['2026-08-12'].map(unit => unit.id), ['E', 'F']);
});
test('začatá budúca dávka zostane pevná a ďalšie repliky idú až za ňu', () => {
  const completed = (id, order) => ({ id, order, text: id, minutes: 10, completedAt: '2026-08-10T10:00:00' });
  const plan = buildSchedule([
    completed('A', 0), completed('B', 1),
    { id: 'C', order: 2, text: 'C', minutes: 10 }, { id: 'D', order: 3, text: 'D', minutes: 10 },
    { id: 'E', order: 4, text: 'E', minutes: 10 }, { id: 'F', order: 5, text: 'F', minutes: 10 }
  ], {
    start: '2026-08-10', deadline: '2026-08-12',
    lockedPlans: { '2026-08-10': ['A', 'B'], '2026-08-11': ['C', 'D'] }
  });
  assert.deepEqual(plan.schedule['2026-08-11'].map(unit => unit.id), ['C', 'D']);
  assert.deepEqual(plan.schedule['2026-08-12'].map(unit => unit.id), ['E', 'F']);
});
test('opakovanie vráti unikátne úseky zvládnuté pred 1, 3 a 7 dňami', () => {
  const completed = [1, 3, 7, 2].map((gap, index) => ({ id: String(index), text: 'Text', minutes: 5, order: index, completedAt: `2026-08-${String(10 - gap).padStart(2, '0')}T12:00:00` }));
  assert.deepEqual(reviewUnitsForDate(completed, '2026-08-10').map(unit => unit.id), ['0', '1', '2']);
});
test('slabé miesto zvýši plánovaciu váhu a rezervné dni sa chránia', () => {
  assert.ok(unitWeight({ text: 'Text', minutes: 5, weak: true }) > unitWeight({ text: 'Text', minutes: 5 }));
  const plan = buildSchedule(units, { start: '2026-08-10', newMaterialEnd: '2026-08-12', deadline: '2026-08-14', overloadThreshold: 999 });
  assert.equal(plan.schedule['2026-08-13'].length, 0); assert.equal(plan.schedule['2026-08-14'].length, 0);
});
test('tvorba úseku zachová partnerov cue', () => {
  const scenes = [{ title: 'Obraz', section: 'I. dejstvo', entries: [{ type: 'speech', speaker: 'B', text: 'Tak prídeš?' }, { type: 'speech', speaker: 'A', text: 'Prídem.' }], ownLines: [{ text: 'Prídem.' }] }];
  const created = createStudyUnits(scenes, 'A', () => 'cue-unit');
  assert.equal(created[0].cueSpeaker, 'B'); assert.equal(created[0].cue, 'Tak prídeš?'); assert.equal(created[0].text, 'Prídem.');
});
