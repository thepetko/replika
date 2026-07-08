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
  replaceFromBackup,
  saveAppData,
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
