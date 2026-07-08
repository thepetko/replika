export const APP_STORAGE_KEY = 'replikaAppData';
export const LEGACY_TEXT_KEY = 'replikaText';
export const SCHEMA_VERSION = 2;
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

export function createEmptyAppData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: null,
    rehearsals: [],
    activity: { days: {} }
  };
}

export function validateAppData(value) {
  if (!isPlainObject(value)) throw new Error('Uložené dáta nemajú platný formát.');
  if (value.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Uložené dáta používajú novšiu verziu aplikácie.');
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Uložené dáta používajú nepodporovanú verziu.');
  }
  if (!Array.isArray(value.rehearsals)) throw new Error('Knižnica replík nie je platná.');
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
    if (rehearsal.status !== undefined && !['draft', 'inProgress', 'completed', 'reviewDue', 'reviewVerified'].includes(rehearsal.status)) {
      throw new Error('Backup obsahuje neplatný stav repliky.');
    }
    if (rehearsal.parsed !== null && rehearsal.parsed !== undefined) {
      if (!isPlainObject(rehearsal.parsed) || !Array.isArray(rehearsal.parsed.sentences) || !Array.isArray(rehearsal.parsed.blocks)) {
        throw new Error('Backup obsahuje neplatné rozdelenie textu.');
      }
    }
    validateSession(rehearsal.session);
  }

  for (const day of Object.values(value.activity.days)) {
    if (!isPlainObject(day) || !Number.isFinite(Number(day.totalSeconds)) || Number(day.totalSeconds) < 0 || !isPlainObject(day.byRehearsal)) {
      throw new Error('Backup obsahuje neplatné časové štatistiky.');
    }
    if (!Object.values(day.byRehearsal).every(seconds => Number.isFinite(Number(seconds)) && Number(seconds) >= 0)) {
      throw new Error('Backup obsahuje neplatný čas repliky.');
    }
  }

  return clone(value);
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
  if (backup.schemaVersion !== SCHEMA_VERSION) {
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
