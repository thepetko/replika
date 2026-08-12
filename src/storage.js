export const APP_STORAGE_KEY = 'replikaAppData';
export const LEGACY_TEXT_KEY = 'replikaText';
export const SCHEMA_VERSION = 6;
export const BACKUP_TYPE = 'replika-full-backup';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
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
  if (value.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Uložené dáta používajú novšiu verziu aplikácie.');
  }
  if (![2, 3, 4, 5, SCHEMA_VERSION].includes(value.schemaVersion)) {
    throw new Error('Uložené dáta používajú nepodporovanú verziu.');
  }
  if (!Array.isArray(value.rehearsals)) throw new Error('Knižnica replík nie je platná.');
  if (value.games !== undefined && !Array.isArray(value.games)) throw new Error('Knižnica hier nie je platná.');
  if (!isPlainObject(value.activity) || !isPlainObject(value.activity.days)) {
    throw new Error('Časové štatistiky nie sú platné.');
  }

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
    if (!isPlainObject(game) || typeof game.id !== 'string' || typeof game.title !== 'string' || typeof game.character !== 'string' || typeof game.deadline !== 'string' || !Array.isArray(game.daysOff) || !Array.isArray(game.units)) throw new Error('Backup obsahuje neplatnú hru.');
    if (!game.daysOff.every(day => typeof day === 'string') || !game.units.every(unit => isPlainObject(unit) && typeof unit.id === 'string' && typeof unit.text === 'string' && Number.isFinite(Number(unit.minutes)))) throw new Error('Backup obsahuje neplatný plán hry.');
    if (game.newMaterialEnd !== undefined && typeof game.newMaterialEnd !== 'string') throw new Error('Backup obsahuje neplatný termín nového textu.');
    if (game.lockedPlans !== undefined && (!isPlainObject(game.lockedPlans) || !Object.values(game.lockedPlans).every(ids => Array.isArray(ids) && ids.every(id => typeof id === 'string')))) throw new Error('Backup obsahuje neplatný uzamknutý plán.');
  }

  for (const day of Object.values(value.activity.days)) {
    if (!isPlainObject(day) || !Number.isFinite(Number(day.totalSeconds)) || Number(day.totalSeconds) < 0 || !isPlainObject(day.byRehearsal)) {
      throw new Error('Backup obsahuje neplatné časové štatistiky.');
    }
    if (!Object.values(day.byRehearsal).every(seconds => Number.isFinite(Number(seconds)) && Number(seconds) >= 0)) {
      throw new Error('Backup obsahuje neplatný čas repliky.');
    }
  }

  const normalized = clone(value);
  normalized.schemaVersion = SCHEMA_VERSION;
  normalized.games ??= [];
  for (const game of normalized.games) {
    game.startDate ??= game.createdAt?.slice(0, 10) || game.deadline;
    game.newMaterialEnd ??= shiftDate(game.deadline, -3);
    game.lockedPlans ??= {};
    for (const unit of game.units) unit.weak = Boolean(unit.weak);
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
  return validateAppData(parsed);
}

export function saveAppData(data, storage = globalThis.localStorage, now = new Date().toISOString()) {
  const next = validateAppData({ ...clone(data), updatedAt: now });
  storage?.setItem(APP_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getLegacyText(storage = globalThis.localStorage) {
  return storage?.getItem(LEGACY_TEXT_KEY)?.trim() ?? '';
}

export function migrateLegacyData(data, storage = globalThis.localStorage, options = {}) {
  const text = getLegacyText(storage);
  if (!text) return clone(data);

  const now = options.now ?? new Date().toISOString();
  const next = clone(data);
  next.rehearsals.push({
    id: options.id ?? globalThis.crypto?.randomUUID?.() ?? `legacy-${Date.now()}`,
    title: options.title ?? 'Importovaná replika',
    play: '',
    character: '',
    scene: '',
    text,
    parserVersion: null,
    parsed: null,
    session: null,
    status: 'draft',
    reviewDueAt: null,
    reviewCompletedAt: null,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null,
    stats: { activeSeconds: 0, completedRuns: 0, assistedAttempts: 0 }
  });

  const saved = saveAppData(next, storage, now);
  storage?.removeItem(LEGACY_TEXT_KEY);
  return saved;
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
  if (![2, 3, 4, 5, SCHEMA_VERSION].includes(backup.schemaVersion)) {
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

// Dočasná kompatibilita pre staršie integrácie.
export function loadText(storage = globalThis.localStorage) {
  return getLegacyText(storage);
}

export function saveText(text, storage = globalThis.localStorage) {
  storage?.setItem(LEGACY_TEXT_KEY, text);
  return true;
}

export function clearText(storage = globalThis.localStorage) {
  storage?.removeItem(LEGACY_TEXT_KEY);
  return true;
}
