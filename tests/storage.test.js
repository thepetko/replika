import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_STORAGE_KEY,
  SCHEMA_VERSION,
  clearAppData,
  createBackup,
  createEmptyAppData,
  loadAppData,
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

function scriptGame(id = 'script-game') {
  return {
    id, title: 'Nová hra', character: 'TULÁK', deadline: '2026-08-27', daysOff: [], focusSectionId: null, dailyTargets: {},
    script: {
      entries: [{ id: `${id}-entry`, sourceIndex: 0, rawText: 'TULÁK: Text.', text: 'Text.', style: '', type: 'speech', speaker: 'TULÁK', sectionId: `${id}-section`, speechId: `${id}-speech`, ambiguous: false }],
      sections: [{ id: `${id}-section`, title: 'Prvé dejstvo', headingEntryId: null, order: 0 }],
      speeches: [{ id: `${id}-speech`, speaker: 'TULÁK', sectionId: `${id}-section`, entryIds: [`${id}-entry`], text: 'Text.', order: 0, learnedAt: null }],
      speakers: ['TULÁK']
    }
  };
}

test('prázdne úložisko vytvorí platnú schému', () => {
  const data = loadAppData(memoryStorage());

  assert.equal(data.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(data.rehearsals, []);
  assert.deepEqual(data.activity, { days: {} });
});

test('úplný reset odstráni aplikáciu aj opustený lokálny kľúč', () => {
  const storage = memoryStorage({
    [APP_STORAGE_KEY]: JSON.stringify(createEmptyAppData()),
    replikaText: 'Starý text.',
    unrelated: 'ponechať'
  });

  clearAppData(storage);

  assert.equal(storage.getItem(APP_STORAGE_KEY), null);
  assert.equal(storage.getItem('replikaText'), null);
  assert.equal(storage.getItem('unrelated'), 'ponechať');
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

test('backup zachová celý scenár a voľné dni', () => {
  const data = createEmptyAppData();
  const game = scriptGame('game-1'); game.daysOff = ['2026-08-15']; game.script.speeches[0].note = 'Prejsť k oknu.'; data.games.push(game);
  const restored = validateBackup(createBackup(data));
  assert.equal(restored.data.games[0].daysOff[0], '2026-08-15');
  assert.equal(restored.data.games[0].script.speeches[0].text, 'Text.');
  assert.equal(restored.data.games[0].script.speeches[0].note, 'Prejsť k oknu.');
});

test('migrácia schémy 8 doplní k replikám prázdnu poznámku', () => {
  const old = createEmptyAppData();
  old.schemaVersion = 8;
  old.games.push(scriptGame('game-without-notes'));

  const migrated = validateAppData(old);

  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.games[0].script.speeches[0].note, '');
});

test('migrácia ponechá iba hry s celým scenárom a odstráni technické označenie režimu', () => {
  const old = createEmptyAppData(); old.schemaVersion = 7;
  old.games.push({ id: 'old', title: 'Pôvodná hra', character: 'A', deadline: '2026-08-27', daysOff: [], units: [{ id: 'u', text: 'Text.', minutes: 5 }] });
  old.games.push({ ...scriptGame('kept'), mode: 'script' });
  const migrated = validateAppData(old);
  assert.deepEqual(migrated.games.map(game => game.id), ['kept']);
  assert.equal(Object.hasOwn(migrated.games[0], 'mode'), false);
});

test('načítanie uloží zjednotený model späť a pôvodnú hru už nedrží v úložisku', () => {
  const old = createEmptyAppData(); old.schemaVersion = 7;
  old.games.push({ id: 'old', title: 'Pôvodná hra', character: 'A', deadline: '2026-08-27', daysOff: [], units: [{ id: 'u', text: 'Text.', minutes: 5 }] });
  old.games.push({ ...scriptGame('kept'), mode: 'script' });
  const storage = memoryStorage({ [APP_STORAGE_KEY]: JSON.stringify(old) });

  const loaded = loadAppData(storage);
  const persisted = JSON.parse(storage.getItem(APP_STORAGE_KEY));

  assert.deepEqual(loaded.games.map(game => game.id), ['kept']);
  assert.deepEqual(persisted.games.map(game => game.id), ['kept']);
  assert.equal(Object.hasOwn(persisted.games[0], 'mode'), false);
});

test('backup obnoví celý webový scenár, progres, prioritu a dnešný cieľ', () => {
  const data = createEmptyAppData();
  data.games.push({
    id: 'script-game', title: 'Nová hra', character: 'TULÁK',
    deadline: '2026-08-27', daysOff: ['2026-08-15'], focusSectionId: 'section-1',
    dailyTargets: { '2026-08-12': { speechIds: ['speech-1'], createdAt: '2026-08-12T08:00:00.000Z' } },
    script: {
      entries: [{ id: 'entry-1', sourceIndex: 0, rawText: 'TULÁK: Text.', text: 'Text.', style: '', type: 'speech', speaker: 'TULÁK', sectionId: 'section-1', speechId: 'speech-1', ambiguous: false }],
      sections: [{ id: 'section-1', title: 'Prvé dejstvo', headingEntryId: null, order: 0 }],
      speeches: [{ id: 'speech-1', speaker: 'TULÁK', sectionId: 'section-1', entryIds: ['entry-1'], text: 'Text.', order: 0, learnedAt: '2026-08-12T09:00:00.000Z' }],
      speakers: ['TULÁK']
    }
  });
  const restored = validateBackup(createBackup(data)).data.games[0];
  assert.equal(Object.hasOwn(restored, 'mode'), false);
  assert.equal(restored.script.entries[0].rawText, 'TULÁK: Text.');
  assert.equal(restored.script.speeches[0].learnedAt, '2026-08-12T09:00:00.000Z');
  assert.equal(restored.focusSectionId, 'section-1');
  assert.deepEqual(restored.dailyTargets['2026-08-12'].speechIds, ['speech-1']);
});

test('odstránenie hry vymaže iba jej scény a zachová ostatné dáta', () => {
  const data = createEmptyAppData();
  const game = id => ({ ...scriptGame(id), title: id });
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
