import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_STORAGE_KEY,
  LEGACY_TEXT_KEY,
  SCHEMA_VERSION,
  createBackup,
  createEmptyAppData,
  loadAppData,
  migrateLegacyData,
  removeGameData,
  replaceFromBackup,
  saveAppData,
  validateAppData,
  validateBackup
} from '../src/storage.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    dump: () => Object.fromEntries(values)
  };
}

test('prázdne úložisko vytvorí platnú schému', () => {
  const data = loadAppData(memoryStorage());

  assert.equal(data.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(data.rehearsals, []);
  assert.deepEqual(data.activity, { days: {} });
});

test('uloží a znovu načíta celú knižnicu', () => {
  const storage = memoryStorage();
  const data = createEmptyAppData();
  data.rehearsals.push({ id: 'r1', title: 'Hamlet', text: 'Byť či nebyť.' });

  saveAppData(data, storage, '2026-07-08T10:00:00.000Z');
  const loaded = loadAppData(storage);

  assert.equal(loaded.rehearsals[0].title, 'Hamlet');
  assert.equal(loaded.updatedAt, '2026-07-08T10:00:00.000Z');
});

test('uloží a obnoví reláciu v kumulatívnej kontrole', () => {
  const storage = memoryStorage();
  const data = createEmptyAppData();
  data.rehearsals.push({
    id: 'r-checkpoint',
    title: 'Dlhá replika',
    text: 'Päť viet.',
    session: {
      sentences: ['1.', '2.', '3.', '4.', '5.'],
      blocks: [{ start: 0, end: 4 }],
      state: { phase: 'checkpoint' },
      status: 'active',
      history: []
    }
  });

  saveAppData(data, storage, '2026-07-08T10:00:00.000Z');

  assert.equal(loadAppData(storage).rehearsals[0].session.state.phase, 'checkpoint');
});

test('starý replikaText sa migruje až po výslovnom volaní', () => {
  const storage = memoryStorage({ [LEGACY_TEXT_KEY]: 'Starý text.' });
  const original = loadAppData(storage);

  assert.equal(original.rehearsals.length, 0);
  const migrated = migrateLegacyData(original, storage, {
    id: 'legacy-1',
    title: 'Importovaná replika',
    now: '2026-07-08T10:00:00.000Z'
  });

  assert.equal(migrated.rehearsals[0].text, 'Starý text.');
  assert.equal(storage.getItem(LEGACY_TEXT_KEY), null);
  assert.ok(storage.getItem(APP_STORAGE_KEY));
});

test('platný backup obnoví knižnicu aj aktivitu', () => {
  const storage = memoryStorage();
  const data = createEmptyAppData();
  data.rehearsals.push({ id: 'r1', title: 'Replika', text: 'Text.' });
  data.activity.days['2026-07-08'] = { totalSeconds: 90, byRehearsal: { r1: 60 } };
  const backup = createBackup(data, '2026-07-08T12:00:00.000Z');

  const restored = replaceFromBackup(backup, storage, '2026-07-08T12:05:00.000Z');

  assert.equal(restored.rehearsals[0].id, 'r1');
  assert.equal(restored.activity.days['2026-07-08'].totalSeconds, 90);
});

test('poškodený alebo novší backup sa odmietne bez prepísania dát', () => {
  const storage = memoryStorage();
  const current = createEmptyAppData();
  current.rehearsals.push({ id: 'keep', title: 'Ponechať', text: 'Text.' });
  saveAppData(current, storage, '2026-07-08T10:00:00.000Z');
  const before = storage.getItem(APP_STORAGE_KEY);

  assert.throws(() => validateBackup('{neplatný json'), /Backup nie je platný JSON/);
  assert.throws(() => replaceFromBackup({
    backupType: 'replika-full-backup',
    schemaVersion: SCHEMA_VERSION + 1,
    data: createEmptyAppData()
  }, storage), /novšiu verziu/);
  assert.equal(storage.getItem(APP_STORAGE_KEY), before);
});

test('backup s poškodenou reláciou sa odmietne', () => {
  const data = createEmptyAppData();
  data.rehearsals.push({
    id: 'broken',
    title: 'Poškodená',
    text: 'Text.',
    session: { status: 'active', state: { phase: 'random' }, sentences: [], blocks: [], history: [] }
  });

  assert.throws(() => validateBackup({
    backupType: 'replika-full-backup',
    schemaVersion: SCHEMA_VERSION,
    data
  }), /neplatný stav/);
});

test('migrácia schémy 2 zachová existujúcu repliku a prijme scénu', () => {
  const old = createEmptyAppData();
  old.schemaVersion = 2;
  old.rehearsals.push({ id: 'old', title: 'Staré', text: 'Text.' });
  const scene = {
    id: 'scene', type: 'scene', title: 'Scéna', text: 'A: Ahoj\nB: Čau', character: 'A',
    parsed: { entries: [{ type: 'speech', speaker: 'A', text: 'Ahoj' }, { type: 'speech', speaker: 'B', text: 'Čau' }] },
    session: null
  };
  old.rehearsals.push(scene);
  const storage = memoryStorage();
  saveAppData(old, storage);
  const loaded = loadAppData(storage);
  assert.equal(loaded.schemaVersion, SCHEMA_VERSION);
  assert.equal(loaded.rehearsals[0].title, 'Staré');
  assert.equal(loaded.rehearsals[1].type, 'scene');
});

test('backup zachová hru s plánom a voľnými dňami', () => {
  const data = createEmptyAppData();
  data.games.push({
    id: 'game-1', title: 'Hra', character: 'ANNA', startDate: '2026-08-10', newMaterialEnd: '2026-08-24', deadline: '2026-08-27', daysOff: ['2026-08-15'], lockedPlans: { '2026-08-10': ['unit-1'] },
    units: [{ id: 'unit-1', sceneTitle: 'I. dejstvo', section: 'I. dejstvo', text: 'Text.', minutes: 8, completedAt: null, weak: true }]
  });
  const restored = validateBackup(createBackup(data));
  assert.equal(restored.data.games[0].daysOff[0], '2026-08-15');
  assert.equal(restored.data.games[0].units[0].minutes, 8);
  assert.deepEqual(restored.data.games[0].lockedPlans['2026-08-10'], ['unit-1']);
  assert.equal(restored.data.games[0].units[0].weak, true);
});

test('schéma 5 bezpečne doplní konfiguráciu dynamického plánu', () => {
  const old = createEmptyAppData(); old.schemaVersion = 5;
  old.games.push({ id: 'g', title: 'Stará hra', character: 'A', deadline: '2026-08-27', daysOff: [], units: [{ id: 'u', text: 'Text.', minutes: 5 }] });
  const migrated = validateAppData(old);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION); assert.equal(migrated.games[0].newMaterialEnd, '2026-08-24'); assert.deepEqual(migrated.games[0].lockedPlans, {});
});

test('odstránenie hry vymaže iba jej scény a zachová ostatné dáta', () => {
  const data = createEmptyAppData();
  const game = id => ({ id, title: id, character: 'A', deadline: '2026-08-27', daysOff: [], units: [{ id: `${id}-unit`, text: 'Text.', minutes: 5 }] });
  const scene = (id, gameId) => ({ id, gameId, type: 'scene', title: id, text: 'A: Text.', character: 'A', parsed: { entries: [{ type: 'speech', speaker: 'A', text: 'Text.' }] } });
  data.games.push(game('game-1'), game('game-2'));
  data.rehearsals.push(
    scene('scene-1', 'game-1'),
    scene('scene-2', 'game-2'),
    { id: 'standalone', title: 'Samostatná replika', text: 'Text.', parsed: null }
  );
  data.activity.days['2026-08-12'] = { totalSeconds: 90, byRehearsal: { 'scene-1': 30, 'scene-2': 40, standalone: 20 } };

  const next = removeGameData(data, 'game-1');

  assert.deepEqual(next.games.map(item => item.id), ['game-2']);
  assert.deepEqual(next.rehearsals.map(item => item.id), ['scene-2', 'standalone']);
  assert.deepEqual(next.activity.days['2026-08-12'], { totalSeconds: 90, byRehearsal: { 'scene-2': 40, standalone: 20 } });
});
