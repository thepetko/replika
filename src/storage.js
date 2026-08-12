export const APP_STORAGE_KEY = 'replikaAppData';
export const SCHEMA_VERSION = 9;
export const BACKUP_TYPE = 'replika-full-backup';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateSession(session) {
  if (session === null || session === undefined) return;
  if (!isPlainObject(session) || !Array.isArray(session.sentences) || !Array.isArray(session.blocks)) {
    throw new Error('Backup obsahuje neplatnú učebnú reláciu.');
  }
  if (!session.sentences.every(sentence => typeof sentence === 'string')) {
    throw new Error('Učebná relácia obsahuje neplatné vety.');
  }
  if (!isPlainObject(session.state) || !['learn', 'bridge', 'block', 'checkpoint', 'all'].includes(session.state.phase)) {
    throw new Error('Učebná relácia obsahuje neplatný stav.');
  }
  if (!['active', 'done'].includes(session.status) || !Array.isArray(session.history)) {
    throw new Error('Učebná relácia obsahuje neplatnú históriu.');
  }
}

function validateSceneSession(session) {
  if (session === null || session === undefined) return;
  if (!isPlainObject(session) || !Array.isArray(session.entries) || typeof session.character !== 'string') {
    throw new Error('Backup obsahuje neplatnú učebnú reláciu scény.');
  }
  if (!isPlainObject(session.state) || !['learn', 'checkpoint', 'all'].includes(session.state.phase)) {
    throw new Error('Učebná relácia scény obsahuje neplatný stav.');
  }
  if (!['active', 'done'].includes(session.status) || !Array.isArray(session.history)) {
    throw new Error('Učebná relácia scény obsahuje neplatnú históriu.');
  }
}

function validateScriptGame(game) {
  if (!isPlainObject(game.script)
    || !Array.isArray(game.script.entries)
    || !Array.isArray(game.script.sections)
    || !Array.isArray(game.script.speeches)
    || !Array.isArray(game.script.speakers)) {
    throw new Error('Backup obsahuje neplatný webový scenár.');
  }
  const entryIds = new Set();
  let previousSourceIndex = -1;
  for (const entry of game.script.entries) {
    if (!isPlainObject(entry) || typeof entry.id !== 'string' || entryIds.has(entry.id)
      || !Number.isInteger(entry.sourceIndex) || typeof entry.rawText !== 'string'
      || typeof entry.text !== 'string' || typeof entry.type !== 'string'
      || typeof entry.sectionId !== 'string' || entry.sourceIndex <= previousSourceIndex) {
      throw new Error('Backup obsahuje neplatný blok scenára.');
    }
    entryIds.add(entry.id);
    previousSourceIndex = entry.sourceIndex;
  }
  const sectionIds = new Set(game.script.sections.map(section => section?.id));
  if (sectionIds.has(undefined) || sectionIds.size !== game.script.sections.length
    || !game.script.sections.every(section => isPlainObject(section) && typeof section.title === 'string')
    || !game.script.entries.every(entry => sectionIds.has(entry.sectionId))) {
    throw new Error('Backup obsahuje neplatné členenie scenára.');
  }
  const speechIds = new Set();
  for (const speech of game.script.speeches) {
    if (!isPlainObject(speech) || typeof speech.id !== 'string' || speechIds.has(speech.id)
      || typeof speech.speaker !== 'string' || !sectionIds.has(speech.sectionId)
      || !Array.isArray(speech.entryIds) || !speech.entryIds.every(id => entryIds.has(id))
      || typeof speech.text !== 'string'
      || (speech.note !== undefined && typeof speech.note !== 'string')
      || (speech.learnedAt !== null && speech.learnedAt !== undefined && typeof speech.learnedAt !== 'string')) {
      throw new Error('Backup obsahuje neplatnú repliku scenára.');
    }
    speechIds.add(speech.id);
  }
  if (!game.script.speakers.every(speaker => typeof speaker === 'string')) throw new Error('Backup obsahuje neplatný zoznam postáv.');
  if (!isPlainObject(game.dailyTargets ?? {})) throw new Error('Backup obsahuje neplatný dnešný cieľ.');
  for (const target of Object.values(game.dailyTargets ?? {})) {
    if (!isPlainObject(target) || !Array.isArray(target.speechIds) || !target.speechIds.every(id => speechIds.has(id))) {
      throw new Error('Backup obsahuje neplatný dnešný cieľ.');
    }
  }
  if (game.focusSectionId !== null && game.focusSectionId !== undefined && !sectionIds.has(game.focusSectionId)) {
    throw new Error('Backup obsahuje neplatnú prioritu scenára.');
  }
}

export function createEmptyAppData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: null,
    rehearsals: [],
    games: [],
    activity: { days: {} }
  };
}

export function validateAppData(value) {
  if (!isPlainObject(value)) throw new Error('Uložené dáta nemajú platný formát.');
  value = clone(value);
  if (value.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Uložené dáta používajú novšiu verziu aplikácie.');
  }
  if (![2, 3, 4, 5, 6, 7, 8, SCHEMA_VERSION].includes(value.schemaVersion)) {
    throw new Error('Uložené dáta používajú nepodporovanú verziu.');
  }
  if (!Array.isArray(value.rehearsals)) throw new Error('Knižnica replík nie je platná.');
  if (value.games !== undefined && !Array.isArray(value.games)) throw new Error('Knižnica hier nie je platná.');
  if (!isPlainObject(value.activity) || !isPlainObject(value.activity.days)) {
    throw new Error('Časové štatistiky nie sú platné.');
  }
  value.games ??= [];
  if (value.schemaVersion < 8) {
    value.games = value.games.filter(game => game?.mode === 'script' || isPlainObject(game?.script));
  }
  for (const game of value.games) delete game.mode;

  for (const rehearsal of value.rehearsals) {
    if (!isPlainObject(rehearsal) || typeof rehearsal.id !== 'string' || !rehearsal.id) {
      throw new Error('Backup obsahuje repliku bez platného ID.');
    }
    if (typeof rehearsal.title !== 'string' || typeof rehearsal.text !== 'string') {
      throw new Error('Backup obsahuje neplatnú repliku.');
    }
    if (rehearsal.importFingerprint !== undefined && typeof rehearsal.importFingerprint !== 'string') {
      throw new Error('Backup obsahuje neplatný údaj o importe.');
    }
    if (rehearsal.status !== undefined && !['draft', 'inProgress', 'completed', 'reviewDue', 'reviewVerified'].includes(rehearsal.status)) {
      throw new Error('Backup obsahuje neplatný stav repliky.');
    }
    const type = rehearsal.type ?? 'rehearsal';
    if (!['rehearsal', 'scene'].includes(type)) throw new Error('Backup obsahuje neplatný typ textu.');
    if (type === 'scene') {
      if (typeof rehearsal.character !== 'string' || !isPlainObject(rehearsal.parsed) || !Array.isArray(rehearsal.parsed.entries)) {
        throw new Error('Backup obsahuje neplatnú scénu.');
      }
      validateSceneSession(rehearsal.session);
      continue;
    }
    if (rehearsal.parsed !== null && rehearsal.parsed !== undefined) {
      if (!isPlainObject(rehearsal.parsed) || !Array.isArray(rehearsal.parsed.sentences) || !Array.isArray(rehearsal.parsed.blocks)) {
        throw new Error('Backup obsahuje neplatné rozdelenie textu.');
      }
    }
    validateSession(rehearsal.session);
  }
  for (const game of value.games ?? []) {
    if (!isPlainObject(game) || typeof game.id !== 'string' || typeof game.title !== 'string' || typeof game.character !== 'string' || typeof game.deadline !== 'string' || !Array.isArray(game.daysOff)) throw new Error('Backup obsahuje neplatnú hru.');
    if (!game.daysOff.every(day => typeof day === 'string')) throw new Error('Backup obsahuje neplatný plán hry.');
    validateScriptGame(game);
  }

  for (const day of Object.values(value.activity.days)) {
    if (!isPlainObject(day) || !Number.isFinite(Number(day.totalSeconds)) || Number(day.totalSeconds) < 0 || !isPlainObject(day.byRehearsal)) {
      throw new Error('Backup obsahuje neplatné časové štatistiky.');
    }
    if (!Object.values(day.byRehearsal).every(seconds => Number.isFinite(Number(seconds)) && Number(seconds) >= 0)) {
      throw new Error('Backup obsahuje neplatný čas repliky.');
    }
  }

  const normalized = value;
  normalized.schemaVersion = SCHEMA_VERSION;
  normalized.games ??= [];
  for (const game of normalized.games) {
    game.startDate ??= game.createdAt?.slice(0, 10) || game.deadline;
    game.daysOff ??= [];
    game.dailyTargets ??= {};
    game.focusSectionId ??= null;
    for (const speech of game.script.speeches) {
      speech.learnedAt ??= null;
      speech.note ??= '';
    }
  }
  return normalized;
}

export function loadAppData(storage = globalThis.localStorage) {
  const raw = storage?.getItem(APP_STORAGE_KEY);
  if (!raw) return createEmptyAppData();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Uložené dáta sa nedajú prečítať. Exportuj ich pred ďalšími zmenami.');
  }
  const normalized = validateAppData(parsed);
  if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
    storage?.setItem(APP_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function saveAppData(data, storage = globalThis.localStorage, now = new Date().toISOString()) {
  const next = validateAppData({ ...clone(data), updatedAt: now });
  storage?.setItem(APP_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearAppData(storage = globalThis.localStorage) {
  storage?.removeItem(APP_STORAGE_KEY);
  storage?.removeItem('replikaText');
}

export function createBackup(data, now = new Date().toISOString()) {
  return {
    backupType: BACKUP_TYPE,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    data: validateAppData(data)
  };
}

export function validateBackup(input) {
  let backup = input;
  if (typeof input === 'string') {
    try {
      backup = JSON.parse(input);
    } catch {
      throw new Error('Backup nie je platný JSON súbor.');
    }
  }

  if (!isPlainObject(backup) || backup.backupType !== BACKUP_TYPE) {
    throw new Error('Súbor nie je backup aplikácie Replika.');
  }
  if (backup.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Backup používa novšiu verziu aplikácie.');
  }
  if (![2, 3, 4, 5, 6, 7, 8, SCHEMA_VERSION].includes(backup.schemaVersion)) {
    throw new Error('Verzia backupu nie je podporovaná.');
  }

  return {
    backupType: BACKUP_TYPE,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
    data: validateAppData(backup.data)
  };
}

export function replaceFromBackup(backup, storage = globalThis.localStorage, now = new Date().toISOString()) {
  const validated = validateBackup(backup);
  return saveAppData(validated.data, storage, now);
}

export function removeGameData(data, gameId) {
  const next = validateAppData(data);
  const sceneIds = new Set(next.rehearsals.filter(item => item.gameId === gameId).map(item => item.id));
  next.games = next.games.filter(game => game.id !== gameId);
  next.rehearsals = next.rehearsals.filter(item => item.gameId !== gameId);
  for (const day of Object.values(next.activity.days)) {
    for (const id of sceneIds) delete day.byRehearsal?.[id];
  }
  return next;
}
