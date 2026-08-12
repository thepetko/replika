import { addActivityInterval, summarizeActivity, VisibleActivityTracker } from './activity-tracker.js?v=24';
import {
  advancePresentation,
  createReviewSession,
  createSession,
  getCurrentTask,
  giveHint,
  goBack,
  rateCurrentTask,
  repeatCurrentTask
} from './learning-engine.js?v=24';
import { parseText, PARSER_VERSION } from './parser.js?v=24';
import { parseScene, SCENE_PARSER_VERSION, validateScene } from './scene-parser.js?v=24';
import { fingerprintScript } from './script-importer.js?v=24';
import { readDocxParagraphs } from './docx-reader.js?v=24';
import {
  advanceScenePresentation, createSceneReviewSession, createSceneSession, getCurrentSceneTask,
  giveSceneHint, goBackScene, rateSceneTask, repeatSceneTask
} from './scene-learning-engine.js?v=24';
import {
  APP_STORAGE_KEY,
  clearAppData,
  createBackup,
  createEmptyAppData,
  loadAppData,
  removeGameData,
  replaceFromBackup,
  saveAppData,
  validateBackup
} from './storage.js?v=24';
import { closeMenusOutside, maskMemorizedText } from './ui-interactions.js?v=24';
import { addPlanDays, buildSchedule, estimateMinutes, localDateKey, unitWeight } from './game-plan.js?v=24';
import { enrichStudyUnitPrompts, setStudyUnitCompletion } from './game-dialogue.js?v=24';
import {
  ensureDailyTarget,
  extendDailyTarget,
  isDailyTargetComplete,
  parseScriptDocument,
  scriptDailyPace,
  scriptOwnSpeeches,
  scriptProgress,
  setScriptFocus,
  setScriptSpeechLearned
} from './script-game.js?v=24';

const byId = id => document.getElementById(id);
const views = {
  games: byId('gamesView'),
  gameDetail: byId('gameDetailView'),
  scriptGame: byId('scriptGameView'),
  library: byId('libraryView'),
  progress: byId('progressView'),
  training: byId('trainingView')
};

let appData;
let storageHealthy = true;
let currentView = 'games';
let currentRehearsalId = null;
let currentGameId = null;
let activeGameTab = 'plan';
let selectedPlanDate = null;
let lastPlanAction = null;
let planFeedbackTimer = null;
const hiddenGameUnits = new Set();
let editingRehearsalId = null;
let editingType = 'rehearsal';
let activeLibraryTab = 'rehearsal';
let scriptImportState = null;
let selectionMode = false;
const selectedRehearsalIds = new Set();
const revealedScriptSpeechIds = new Set();
let allScriptLinesRevealed = false;

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `replika-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRehearsal(rehearsal) {
  return {
    type: rehearsal.type ?? 'rehearsal',
    id: rehearsal.id,
    title: rehearsal.title || 'Bez názvu',
    play: rehearsal.play ?? '',
    character: rehearsal.character ?? '',
    scene: rehearsal.scene ?? '',
    importFingerprint: rehearsal.importFingerprint ?? '',
    gameId: rehearsal.gameId ?? '',
    text: rehearsal.text ?? '',
    parserVersion: rehearsal.parserVersion ?? null,
    parsed: rehearsal.parsed ?? null,
    session: rehearsal.session ?? null,
    status: rehearsal.status ?? 'draft',
    reviewDueAt: rehearsal.reviewDueAt ?? null,
    reviewCompletedAt: rehearsal.reviewCompletedAt ?? null,
    createdAt: rehearsal.createdAt ?? nowIso(),
    updatedAt: rehearsal.updatedAt ?? nowIso(),
    lastOpenedAt: rehearsal.lastOpenedAt ?? null,
    stats: {
      activeSeconds: rehearsal.stats?.activeSeconds ?? 0,
      completedRuns: rehearsal.stats?.completedRuns ?? 0,
      assistedAttempts: rehearsal.stats?.assistedAttempts ?? 0
    }
  };
}

function normalizeGame(game) {
  const deadline = game.deadline ?? localDateKey();
  const createdAt = game.createdAt ?? nowIso();
  if (game.mode === 'script') {
    return {
      id: game.id, mode: 'script', title: game.title || 'Bez názvu', character: game.character ?? '',
      importFingerprint: game.importFingerprint ?? '', startDate: game.startDate ?? localDateKey(createdAt),
      deadline, daysOff: [...new Set(game.daysOff ?? [])].sort(), focusSectionId: game.focusSectionId ?? null,
      script: game.script, dailyTargets: game.dailyTargets ?? {}, createdAt, updatedAt: game.updatedAt ?? nowIso()
    };
  }
  const units = (game.units ?? []).map((unit, index) => {
    const sourcePrompts = unit.prompts?.length
      ? unit.prompts
      : [{ cueSpeaker: unit.cueSpeaker || 'VSTUP', cue: unit.cue || 'Vlastný nástup.', cueFull: unit.cueFull || '', text: unit.text }];
    const prompts = sourcePrompts.map(prompt => {
      const cueMissing = prompt.cueMissing || (prompt.cueSpeaker === 'VSTUP' && prompt.cue === 'Vlastný nástup.');
      return cueMissing
        ? { ...prompt, cueMissing: true, cueSpeaker: 'CHÝBA CUE', cue: 'Partnerova replika sa v staršom importe neuložila.' }
        : prompt;
    });
    const words = unit.words || (String(unit.text).match(/[\p{L}\p{N}]+/gu) ?? []).length;
    return {
      ...unit,
      prompts,
      cueSpeaker: prompts[0].cueSpeaker,
      cue: prompts[0].cue,
      words,
      weight: unit.weight || Math.max(Number(unit.minutes || 0) * 8, words),
      difficulty: unit.difficulty || 'stredná',
      weak: Boolean(unit.weak),
      order: Number.isFinite(Number(unit.order)) ? Number(unit.order) : index,
      completedAt: unit.completedAt ?? null
    };
  });
  return {
    id: game.id, mode: 'legacy', title: game.title || 'Bez názvu', character: game.character ?? '',
    importFingerprint: game.importFingerprint ?? '', startDate: game.startDate ?? localDateKey(createdAt),
    deadline, newMaterialEnd: game.newMaterialEnd ?? addPlanDays(deadline, -3),
    daysOff: [...new Set(game.daysOff ?? [])].sort(), lockedPlans: game.lockedPlans ?? {}, units,
    createdAt, updatedAt: game.updatedAt ?? nowIso()
  };
}

try {
  appData = loadAppData();
  appData.rehearsals = appData.rehearsals.map(normalizeRehearsal);
  appData.games = (appData.games ?? []).map(normalizeGame);
} catch (error) {
  storageHealthy = false;
  appData = createEmptyAppData();
  queueMicrotask(() => setLibraryMessage(error.message, true));
}

function currentRehearsal() {
  return appData.rehearsals.find(item => item.id === currentRehearsalId) ?? null;
}

function findRehearsal(id) {
  return appData.rehearsals.find(item => item.id === id) ?? null;
}
function findGame(id) { return appData.games.find(game => game.id === id) ?? null; }

function setLibraryMessage(message = '', isError = false) {
  const element = byId('libraryMessage');
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function persist(message = '') {
  if (!storageHealthy) {
    setLibraryMessage('Úložisko obsahuje poškodené dáta. Najprv obnov platný backup.', true);
    return false;
  }
  try {
    appData = saveAppData(appData);
    if (message) setLibraryMessage(message);
    return true;
  } catch (error) {
    setLibraryMessage(`Dáta sa nepodarilo uložiť: ${error.message}`, true);
    return false;
  }
}

function nextLocalDayIso(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString();
}

function refreshReviewStatuses() {
  const currentTime = Date.now();
  let changed = false;
  for (const rehearsal of appData.rehearsals) {
    if (rehearsal.status === 'completed' && rehearsal.reviewDueAt) {
      if (new Date(rehearsal.reviewDueAt).getTime() <= currentTime) {
        rehearsal.status = 'reviewDue';
        changed = true;
      }
    }
  }
  if (changed) persist();
}

function ensureParsed(rehearsal) {
  if (rehearsal.type === 'scene') {
    if (rehearsal.parserVersion !== SCENE_PARSER_VERSION || !rehearsal.parsed) {
      rehearsal.parsed = parseScene(rehearsal.text);
      rehearsal.parserVersion = SCENE_PARSER_VERSION;
      rehearsal.session = null;
      if (rehearsal.status === 'inProgress') rehearsal.status = 'draft';
    }
    return rehearsal.parsed;
  }
  if (rehearsal.parserVersion !== PARSER_VERSION || !rehearsal.parsed) {
    rehearsal.parsed = parseText(rehearsal.text);
    rehearsal.parserVersion = PARSER_VERSION;
    rehearsal.session = null;
    if (rehearsal.status === 'inProgress') rehearsal.status = 'draft';
  }
  return rehearsal.parsed;
}

function formatDuration(seconds) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function formatDate(iso) {
  if (!iso) return 'Zatiaľ neotvorená';
  return new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

function formatRehearsalCount(count) {
  if (count === 1) return '1 repliku';
  if (count >= 2 && count <= 4) return `${count} repliky`;
  return `${count} replík`;
}

function activitySecondsFor(rehearsalId) {
  return Object.values(appData.activity.days).reduce(
    (sum, day) => sum + (Number(day.byRehearsal?.[rehearsalId]) || 0),
    0
  );
}

function coverageFor(rehearsal) {
  if (rehearsal.type === 'scene') {
    const total = rehearsal.parsed?.entries?.filter(entry => entry.type === 'speech' && entry.speaker === rehearsal.character).length ?? 0;
    if (!total) return 0;
    if (['completed', 'reviewDue', 'reviewVerified'].includes(rehearsal.status)) return 100;
    return Math.round(((rehearsal.session?.state?.learnedIndices?.length ?? 0) / total) * 100);
  }
  const sentenceCount = rehearsal.parsed?.sentences?.length ?? 0;
  if (!sentenceCount) return 0;
  if (['completed', 'reviewDue', 'reviewVerified'].includes(rehearsal.status)) return 100;
  const knownEnd = rehearsal.session?.state?.knownEnd ?? -1;
  return Math.max(0, Math.min(100, Math.round(((knownEnd + 1) / sentenceCount) * 100)));
}

function statusInfo(rehearsal) {
  const statuses = {
    draft: ['Nová', 'status-neutral'],
    inProgress: ['Rozpracovaná', 'status-dark'],
    completed: ['Dokončená', 'status-complete'],
    reviewDue: ['Na zopakovanie', 'status-due'],
    reviewVerified: ['Overená', 'status-verified']
  };
  return statuses[rehearsal.status] ?? statuses.draft;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function normalizedDialogueLabel(text = '') { return String(text).toLocaleLowerCase('sk').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }

function showView(name) {
  currentView = name;
  for (const [viewName, view] of Object.entries(views)) {
    view.classList.toggle('hidden', viewName !== name);
  }
  const inTraining = name === 'training';
  tracker.setRehearsalId(inTraining ? currentRehearsalId : null);
  byId('mainContent').focus({ preventScroll: true });
}

function syncLibraryTabs() {
  const scene = activeLibraryTab === 'scene';
  byId('rehearsalsTabBtn').classList.toggle('active', !scene);
  byId('rehearsalsTabBtn').setAttribute('aria-selected', String(!scene));
  byId('scenesTabBtn').classList.toggle('active', scene);
  byId('scenesTabBtn').setAttribute('aria-selected', String(scene));
}

function formatPlanDate(key) {
  return new Intl.DateTimeFormat('sk-SK', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(`${key}T12:00:00`));
}

function replikaCount(count) {
  return `${count} ${count === 1 ? 'replika' : count >= 2 && count <= 4 ? 'repliky' : 'replík'}`;
}

function gameScenes(game) { return appData.rehearsals.filter(item => item.type === 'scene' && item.gameId === game.id); }

function enrichLegacyGamePrompts(game) {
  return enrichStudyUnitPrompts(game.units, gameScenes(game).map(scene => ({ title: scene.title, entries: scene.parsed?.entries ?? [] })), game.character);
}

function setGamesMessage(message = '', isError = false) {
  const node = byId('gamesMessage'); node.textContent = message; node.classList.toggle('error', isError);
}

function renderGames() {
  const list = byId('gamesList'); list.replaceChildren();
  const games = [...appData.games].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  byId('emptyGames').classList.toggle('hidden', games.length > 0);
  for (const game of games) {
    const card = element('article', 'rehearsal-card');
    const progress = game.mode === 'script'
      ? scriptProgress(game)
      : { learned: game.units.filter(unit => unit.completedAt).length, total: game.units.length, percent: game.units.length ? Math.round(game.units.filter(unit => unit.completedAt).length / game.units.length * 100) : 0 };
    const { learned: done, total, percent } = progress;
    const top = element('div', 'card-topline'); const group = element('div', 'card-title-group');
    const meta = game.mode === 'script'
      ? `${game.character} · celý scenár · termín ${formatPlanDate(game.deadline)}`
      : `${game.character} · ${gameScenes(game).length} scén · termín ${formatPlanDate(game.deadline)}`;
    group.append(element('h2', '', game.title), element('p', 'card-meta', meta));
    if (game.mode !== 'script') group.append(element('span', 'status-chip legacy-chip', 'Starší import'));
    const tools = element('div', 'game-card-tools');
    const menu = element('details', 'card-menu game-card-menu');
    const summary = element('summary', '', '•••'); summary.setAttribute('aria-label', `Možnosti hry ${game.title}`);
    const menuContent = element('div', 'card-menu-panel');
    const importButton = element('button', '', game.mode === 'script' ? 'Importovať ďalšiu hru' : 'Nahrať znova v novom režime'); importButton.type = 'button';
    importButton.addEventListener('click', () => { menu.removeAttribute('open'); openScriptImport(); });
    const exportButton = element('button', '', 'Exportovať zálohu'); exportButton.type = 'button';
    exportButton.addEventListener('click', () => { menu.removeAttribute('open'); downloadBackup(); setGamesMessage('Záloha všetkých dát bola pripravená na stiahnutie.'); });
    const deleteButton = element('button', 'danger-text', 'Odstrániť hru'); deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => { menu.removeAttribute('open'); deleteGame(game.id); });
    menuContent.append(importButton, exportButton, deleteButton); menu.append(summary, menuContent);
    tools.append(element('span', 'status-chip status-dark', `${percent} %`), menu);
    top.append(group, tools);
    const track = element('div', 'mini-progress'); const bar = element('span'); bar.style.width = `${percent}%`; track.append(bar);
    const open = element('button', 'primary', 'Otvoriť hru'); open.type = 'button'; open.addEventListener('click', () => openGame(game.id));
    card.append(top, element('div', 'card-info', game.mode === 'script' ? `${done} z ${replikaCount(total)} hotových` : `${done} z ${total} úsekov hotových`), track, open); list.append(card);
  }
}

function showGames() { currentGameId = null; currentRehearsalId = null; showView('games'); renderGames(); }

async function deleteGame(id) {
  const game = findGame(id); if (!game) return;
  const content = game.mode === 'script' ? 'celý scenár a progres' : `plán, progres a ${gameScenes(game).length} priradených scén`;
  const confirmed = await askConfirm(
    `Odstrániť hru „${game.title}“? Vymaže sa ${content}. Samostatné texty a celkový historický čas zostanú. Hru nebude možné obnoviť bez exportovanej zálohy.`,
    'Odstrániť hru'
  );
  if (!confirmed) return;
  appData = removeGameData(appData, id);
  if (!persist()) return;
  setGamesMessage(`Hra „${game.title}“ bola odstránená.`);
  renderGames();
}

function renderPlanChange() {
  const render = () => renderGameDetail();
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && typeof document.startViewTransition === 'function') document.startViewTransition(render);
  else render();
}

function renderGameUnit(unit, game, planContext = {}) {
  const row = element('article', `game-unit study-line-card${unit.completedAt ? ' done' : ''}${unit.weak ? ' weak' : ''}`);
  const top = element('div', 'study-line-top');
  const label = unit.line ? `Replika ${unit.line}${unit.part || ''}` : `Úsek ${Number(unit.order ?? 0) + 1}`;
  const identity = element('div'); identity.append(element('strong', 'line-number', label), element('span', `difficulty difficulty-${unit.difficulty}`, unit.difficulty));
  const weak = element('button', `weak-button${unit.weak ? ' active' : ''}`, unit.weak ? '★ Ťažké' : '☆ Ťažké'); weak.type = 'button'; weak.setAttribute('aria-label', unit.weak ? 'Zrušiť označenie ťažkého miesta' : 'Označiť ako ťažké miesto'); weak.setAttribute('aria-pressed', String(unit.weak));
  weak.addEventListener('click', () => { unit.weak = !unit.weak; game.updatedAt = nowIso(); persist(); renderPlanChange(); }); top.append(identity, weak);
  const section = unit.section || unit.act || ''; const scene = unit.sceneTitle || unit.beat || '';
  const place = section && scene && normalizedDialogueLabel(scene).includes(normalizedDialogueLabel(section)) ? scene : [section, scene].filter(Boolean).join(' · ');
  const context = element('p', 'game-unit-meta', `${place}${place ? ' · ' : ''}${unit.minutes} min`);
  const prompts = element('div', 'study-prompts');
  for (const prompt of unit.prompts ?? [{ cueSpeaker: unit.cueSpeaker, cue: unit.cue, text: unit.text }]) {
    const pair = element('div', 'study-prompt'); const cue = element('div', `dialogue-line partner-line${prompt.cueMissing ? ' cue-missing' : ''}`); cue.append(element('strong', 'dialogue-speaker', prompt.cueSpeaker || 'VSTUP'), element('p', '', prompt.cueFull || prompt.cue || 'Začiatok scény alebo vlastný nástup.'));
    const own = element('div', 'dialogue-line own-dialogue'); own.append(element('strong', 'dialogue-speaker', game.character));
    own.append(hiddenGameUnits.has(unit.id) ? element('div', 'hidden-line', 'Povedz repliku spamäti.') : element('p', 'own-line', prompt.text)); pair.append(cue, own); prompts.append(pair);
  }
  const actions = element('div', 'study-line-actions'); const reveal = element('button', 'secondary', hiddenGameUnits.has(unit.id) ? 'Ukázať moje repliky' : 'Zakryť moje repliky'); reveal.type = 'button';
  reveal.addEventListener('click', () => { if (hiddenGameUnits.has(unit.id)) hiddenGameUnits.delete(unit.id); else hiddenGameUnits.add(unit.id); renderGameDetail(); });
  const doneControl = element('div', 'done-control');
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(unit.completedAt); checkbox.setAttribute('aria-label', `Viem po cue: ${unit.sceneTitle}`);
  doneControl.append(checkbox, element('span', '', 'Viem po cue'));
  const confirmation = element('span', 'unit-confirmation', '✓ Hotovo'); confirmation.setAttribute('aria-live', 'polite');
  checkbox.addEventListener('change', () => {
    const completed = checkbox.checked;
    const previousCompletedAt = unit.completedAt ?? null;
    const completedAt = completed ? nowIso() : null;
    checkbox.disabled = true;
    row.classList.add(completed ? 'is-completing' : 'is-restoring');
    confirmation.textContent = completed ? '✓ Hotovo' : '↩ Späť v pláne';
    if (!setStudyUnitCompletion(appData.games, game.id, unit.id, completedAt, planContext)) {
      checkbox.checked = !completed; checkbox.disabled = false; row.classList.remove('is-completing', 'is-restoring'); return;
    }
    const currentGame = findGame(game.id); currentGame.updatedAt = nowIso();
    if (!persist()) {
      setStudyUnitCompletion(appData.games, game.id, unit.id, previousCompletedAt);
      checkbox.checked = !completed; checkbox.disabled = false; row.classList.remove('is-completing', 'is-restoring'); return;
    }
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const delay = reduceMotion ? 0 : completed ? 480 : 260;
    setTimeout(() => {
      if (currentView !== 'gameDetail' || currentGameId !== game.id) return;
      lastPlanAction = { completed, unitId: unit.id }; renderPlanChange();
    }, delay);
  });
  actions.append(reveal, doneControl); row.append(top, context, prompts, actions, confirmation); return row;
}

function calendarDateRange(start, end) {
  if (!start || !end || start > end) return [];
  const dates = []; const current = new Date(`${start}T12:00:00`); const last = new Date(`${end}T12:00:00`);
  while (current <= last) { dates.push(localDateKey(current)); current.setDate(current.getDate() + 1); }
  return dates;
}

function renderPlanCalendar(game, plan, today) {
  const calendar = byId('gameCalendar'); calendar.replaceChildren();
  const dates = calendarDateRange(game.startDate || today, game.deadline);
  if (!dates.length) { calendar.append(element('p', 'status-message error', 'Termín je pred dnešným dňom. Zvoľ nový termín.')); return; }
  if (!selectedPlanDate || !dates.includes(selectedPlanDate)) selectedPlanDate = dates.includes(today) ? today : dates[0];
  const daysOff = new Set(game.daysOff);
  const months = new Map(); for (const key of dates) { const date = new Date(`${key}T12:00:00`); const month = `${date.getFullYear()}-${date.getMonth()}`; if (!months.has(month)) months.set(month, []); months.get(month).push({ key, date }); }
  for (const monthDates of months.values()) {
    const month = element('section', 'calendar-month');
    month.append(element('h3', '', new Intl.DateTimeFormat('sk-SK', { month: 'long', year: 'numeric' }).format(monthDates[0].date)));
    const week = element('div', 'calendar-weekdays'); for (const label of ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne']) week.append(element('span', '', label)); month.append(week);
    const grid = element('div', 'calendar-grid');
    const firstOffset = (monthDates[0].date.getDay() + 6) % 7; for (let index = 0; index < firstOffset; index += 1) grid.append(element('span', 'calendar-blank'));
    for (const { key, date } of monthDates) {
      const tasks = plan.schedule[key] ?? []; const reviewCount = plan.reviews[key]?.length ?? 0; const moved = key < today && tasks.some(unit => !unit.completedAt); const button = element('button', `calendar-day${key === today ? ' today' : ''}${key === selectedPlanDate ? ' selected' : ''}${daysOff.has(key) ? ' off' : ''}${moved ? ' moved' : ''}`);
      button.type = 'button'; button.setAttribute('aria-pressed', String(key === selectedPlanDate)); button.setAttribute('aria-label', `${formatPlanDate(key)}${daysOff.has(key) ? ', voľný deň' : `, ${tasks.length} nových úsekov, ${reviewCount} opakovaní`}`);
      button.append(element('strong', '', String(date.getDate())));
      if (daysOff.has(key)) button.append(element('span', 'calendar-off', 'voľno'));
      else if (moved) button.append(element('span', 'calendar-load', `${tasks.length} · presunuté`));
      else if (tasks.length || reviewCount) button.append(element('span', 'calendar-load', `${tasks.length} nové${reviewCount ? ` · ↻ ${reviewCount}` : ''}`));
      button.addEventListener('click', () => {
        selectedPlanDate = key; renderGameDetail();
        const target = key === today ? byId('todayPlanHeading') : byId(`plan-day-${key}`);
        target?.scrollIntoView({ block: 'start', behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }); grid.append(button);
    }
    month.append(grid); calendar.append(month);
  }
}

function renderAllGameUnits(game) {
  const search = byId('gameLineSearch'); const filter = byId('gameActFilter'); const box = byId('gameAllUnits');
  const acts = [...new Set(game.units.map(unit => unit.section || unit.act).filter(Boolean))]; const current = filter.value;
  filter.replaceChildren(new Option('Všetky', ''), ...acts.map(act => new Option(act, act))); filter.value = acts.includes(current) ? current : '';
  const query = search.value.trim().toLocaleLowerCase('sk'); box.replaceChildren();
  const visible = [...game.units].sort((a, b) => Number(a.order) - Number(b.order)).filter(unit => {
    const act = unit.section || unit.act || ''; const haystack = `${unit.text} ${unit.cue} ${unit.sceneTitle} ${(unit.prompts ?? []).map(prompt => `${prompt.cue} ${prompt.text}`).join(' ')}`.toLocaleLowerCase('sk');
    return (!filter.value || act === filter.value) && haystack.includes(query);
  });
  if (!visible.length) box.append(element('p', 'muted-copy', 'Nenašiel sa žiadny úsek.'));
  else visible.forEach(unit => box.append(renderGameUnit(unit, game)));
}

function showGameTab(tab, focus = false) {
  activeGameTab = ['plan', 'scenes', 'lines', 'progress'].includes(tab) ? tab : 'plan';
  const tabs = { plan: byId('gamePlanTab'), scenes: byId('gameScenesTab'), lines: byId('gameLinesTab'), progress: byId('gameProgressTab') };
  const panels = { plan: byId('gamePlanPanel'), scenes: byId('gameScenesPanel'), lines: byId('gameLinesPanel'), progress: byId('gameProgressPanel') };
  for (const key of Object.keys(tabs)) {
    const active = key === activeGameTab; tabs[key].classList.toggle('active', active); tabs[key].setAttribute('aria-selected', String(active)); tabs[key].tabIndex = active ? 0 : -1; panels[key].classList.toggle('hidden', !active);
  }
  if (focus) { tabs[activeGameTab].focus(); panels[activeGameTab].scrollIntoView({ block: 'start', behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
}

function renderGameDetail() {
  const game = findGame(currentGameId); if (!game) return showGames();
  if (enrichLegacyGamePrompts(game)) { game.updatedAt = nowIso(); persist(); }
  byId('gameDetailHeading').textContent = game.title; byId('gameDetailMeta').textContent = `${game.character} · termín ${formatPlanDate(game.deadline)}`;
  const today = localDateKey(); const options = { start: today, calendarStart: game.startDate, newMaterialEnd: game.newMaterialEnd, deadline: game.deadline, daysOff: game.daysOff, lockedPlans: game.lockedPlans };
  let plan = buildSchedule(game.units, options);
  if (!Object.hasOwn(game.lockedPlans, today) && today <= game.deadline && !game.daysOff.includes(today)) { game.lockedPlans[today] = (plan.schedule[today] ?? []).map(unit => unit.id); persist(); plan = buildSchedule(game.units, options); }
  const done = game.units.filter(unit => unit.completedAt).length; const total = game.units.length; const remaining = plan.totalMinutes;
  const totalWeight = game.units.reduce((sum, unit) => sum + unitWeight(unit), 0); const doneWeight = game.units.filter(unit => unit.completedAt).reduce((sum, unit) => sum + unitWeight(unit), 0);
  const metrics = byId('gameMetrics'); metrics.replaceChildren();
  for (const [label, value] of [['Naučené', `${totalWeight ? Math.round(doneWeight / totalWeight * 100) : 0} %`], ['Zostáva', `${remaining} min`], ['Potrebné denne', `${plan.requiredDailyMinutes} min`], ['Termín', formatPlanDate(game.deadline)]]) { const card = element('article', 'metric-card'); card.append(element('span', '', label), element('strong', '', value)); metrics.append(card); }
  const pace = byId('gamePace'); pace.textContent = plan.impossible ? 'Nie je dostupný žiadny deň.' : plan.requiredDailyMinutes > 70 ? 'Vyššie tempo' : 'Plán je rozložený'; pace.className = plan.impossible || plan.requiredDailyMinutes > 70 ? 'error' : '';
  const todayBox = byId('todayPlan'); todayBox.replaceChildren(); const todayUnits = plan.schedule[today] ?? [];
  if (!todayUnits.length) todayBox.append(element('p', 'muted-copy', plan.impossible ? 'Uprav voľné dni alebo termín.' : 'Dnes nemáš naplánovaný nový úsek.'));
  else todayUnits.forEach(unit => todayBox.append(renderGameUnit(unit, game, { date: today, unitIds: todayUnits.map(item => item.id) })));
  const reviews = byId('todayReviews'); reviews.replaceChildren(); const reviewUnits = plan.reviews[today] ?? [];
  if (reviewUnits.length) { reviews.append(element('h3', 'review-heading', `Opakovanie po 1, 3 alebo 7 dňoch · ${reviewUnits.length}`)); reviewUnits.forEach(unit => reviews.append(renderGameUnit(unit, game))); }
  byId('gameDeadline').value = game.deadline; byId('gameNewMaterialEnd').value = game.newMaterialEnd;
  const daysOff = byId('gameDaysOff'); daysOff.replaceChildren(); for (const date of game.daysOff) { const button = element('button', '', `Voľno ${formatPlanDate(date)} ×`); button.type = 'button'; button.addEventListener('click', () => { game.daysOff = game.daysOff.filter(day => day !== date); game.updatedAt = nowIso(); persist(); renderGameDetail(); }); daysOff.append(button); }
  renderPlanCalendar(game, plan, today);
  const schedule = byId('gameSchedule'); schedule.replaceChildren();
  byId('gameScheduleHelp').textContent = 'Vyber deň alebo pokračuj nižšie v chronologickom zozname.';
  if (plan.impossible) schedule.append(element('p', 'status-message error', 'V termíne nie je žiadny dostupný deň. Zruš aspoň jedno voľno alebo posuň termín.'));
  else {
    const upcomingDates = plan.allDates.filter(date => date > today && !game.daysOff.includes(date) && ((plan.schedule[date]?.length ?? 0) || (plan.reviews[date]?.length ?? 0)));
    if (!upcomingDates.length) schedule.append(element('p', 'muted-copy', 'Po dnešku už nemáš naplánovaný nový text ani opakovanie.'));
    for (const date of upcomingDates) {
      const tasks = plan.schedule[date] ?? []; const dateReviews = plan.reviews[date] ?? [];
      const card = element('section', `plan-day-group${date === selectedPlanDate ? ' selected-day' : ''}`); card.id = `plan-day-${date}`;
      const heading = element('div', 'plan-day-heading');
      heading.append(element('h3', '', formatPlanDate(date)), element('p', 'muted-copy', `${tasks.length} nových úsekov${dateReviews.length ? ` · ${dateReviews.length} na opakovanie` : ''}`)); card.append(heading);
      tasks.forEach(unit => card.append(renderGameUnit(unit, game, { date, unitIds: tasks.map(item => item.id) })));
      if (dateReviews.length) { card.append(element('h4', 'review-heading', 'Opakovanie')); dateReviews.forEach(unit => card.append(renderGameUnit(unit, game))); }
      schedule.append(card);
    }
  }
  const feedback = byId('planFeedback');
  if (lastPlanAction) {
    feedback.textContent = lastPlanAction.completed ? '✓ Dávka je označená ako hotová. Zvyšok plánu som prepočítal.' : 'Dávka je späť v pláne a termíny sa prepočítali.';
    feedback.classList.remove('hidden', 'show'); requestAnimationFrame(() => feedback.classList.add('show'));
    clearTimeout(planFeedbackTimer); planFeedbackTimer = setTimeout(() => { feedback.classList.remove('show'); feedback.classList.add('hidden'); }, 3600);
    lastPlanAction = null;
  }
  const scenes = byId('gameScenes'); scenes.replaceChildren(); for (const scene of gameScenes(game)) { const row = element('article', 'rehearsal-card'); row.append(element('h3', '', scene.title), element('p', 'card-meta', `${scene.scene} · ${scene.parsed?.entries?.filter(entry => entry.type === 'speech' && entry.speaker === game.character).length ?? 0} replík`)); const button = element('button', 'secondary', 'Otvoriť scénu'); button.type = 'button'; button.addEventListener('click', () => openRehearsal(scene.id)); row.append(button); scenes.append(row); }
  renderAllGameUnits(game);
  const completedPanel = byId('completedUnitsPanel'); const completedBox = byId('completedUnits'); completedBox.replaceChildren(); const completedUnits = game.units.filter(unit => unit.completedAt).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  byId('completedUnitsCount').textContent = completedUnits.length ? `${completedUnits.length} hotových` : 'zatiaľ žiadne';
  completedPanel.classList.toggle('hidden', !completedUnits.length);
  for (const unit of completedUnits) { const row = renderGameUnit(unit, game); row.querySelector('.game-unit-meta').textContent = `${unit.section} · hotovo ${formatPlanDate(localDateKey(unit.completedAt))}`; completedBox.append(row); }
  showGameTab(activeGameTab);
}

function scriptEntryById(game, id) {
  return game.script.entries.find(entry => entry.id === id);
}

function scriptSectionTitle(game, id) {
  return game.script.sections.find(section => section.id === id)?.title ?? 'Začiatok';
}

function renderScriptSpeech(game, speech, targetIds) {
  const own = speech.speaker === game.character;
  const learned = Boolean(speech.learnedAt);
  const revealed = allScriptLinesRevealed || revealedScriptSpeechIds.has(speech.id);
  const row = element('article', `script-speech${own ? ' own-script-speech' : ' partner-script-speech'}${learned ? ' learned' : ''}${targetIds.has(speech.id) ? ' today-target' : ''}`);
  row.id = `script-speech-${speech.id}`;
  row.append(element('strong', 'script-speaker', speech.speaker));
  const textWrap = element('div', `script-speech-text${own && !revealed ? ' masked' : ''}`);
  const copy = element('div', 'script-speech-copy');
  copy.setAttribute('aria-hidden', String(own && !revealed));
  for (const entryId of speech.entryIds) copy.append(element('p', '', scriptEntryById(game, entryId)?.text ?? ''));
  textWrap.append(copy);
  if (own && !revealed) {
    const reveal = element('button', 'script-mask', 'Odkryť repliku'); reveal.type = 'button';
    reveal.setAttribute('aria-label', `Odkryť repliku postavy ${game.character}`);
    reveal.addEventListener('click', () => { revealedScriptSpeechIds.add(speech.id); renderScriptGame(true); });
    textWrap.append(reveal);
  }
  row.append(textWrap);
  if (own) {
    const controls = element('div', 'script-speech-controls');
    if (revealed) {
      const hide = element('button', 'text-button', 'Skryť repliku'); hide.type = 'button';
      hide.addEventListener('click', () => { revealedScriptSpeechIds.delete(speech.id); allScriptLinesRevealed = false; renderScriptGame(true); });
      controls.append(hide);
    }
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = learned;
    checkbox.className = 'script-known-checkbox'; checkbox.setAttribute('aria-label', `Viem repliku v časti ${scriptSectionTitle(game, speech.sectionId)}`);
    const knownText = element('span', 'script-known-label', 'Viem');
    checkbox.addEventListener('change', () => {
      const previous = speech.learnedAt;
      setScriptSpeechLearned(game, speech.id, checkbox.checked ? nowIso() : null);
      if (!persist()) { speech.learnedAt = previous; checkbox.checked = Boolean(previous); return; }
      row.classList.add(checkbox.checked ? 'is-learning-complete' : 'is-learning-restored');
      knownText.textContent = checkbox.checked ? 'Hotovo' : 'Viem';
      setTimeout(() => { if (currentView === 'scriptGame' && currentGameId === game.id) renderScriptGame(true); }, globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 520);
    });
    controls.append(checkbox, knownText); row.append(controls);
  }
  return row;
}

function renderScriptGame(keepScroll = false) {
  const game = findGame(currentGameId); if (!game || game.mode !== 'script') return showGames();
  const scrollTop = keepScroll ? globalThis.scrollY : 0;
  const today = localDateKey();
  const hadTarget = Boolean(game.dailyTargets?.[today]);
  const target = ensureDailyTarget(game, today, nowIso());
  if (!hadTarget) {
    if (!persist()) return;
    return renderScriptGame(keepScroll);
  }
  const targetIds = new Set(target.speechIds);
  const progress = scriptProgress(game); const pace = scriptDailyPace(game, today);
  byId('scriptGameHeading').textContent = game.title;
  byId('scriptGameMeta').textContent = `${game.character} · termín ${formatPlanDate(game.deadline)}`;
  byId('scriptProgressLabel').textContent = `${progress.learned} z ${progress.total} replík · ${progress.percent} %`;
  byId('scriptPaceLabel').textContent = pace.impossible ? 'Termín už nie je možné stihnúť bez zmeny.' : `${pace.availableDays} dní · približne ${pace.requiredMinutes} min denne`;
  byId('scriptPaceLabel').classList.toggle('error', pace.impossible);
  byId('scriptProgressBar').style.width = `${progress.percent}%`;
  const toggle = byId('toggleAllScriptLinesBtn');
  toggle.textContent = allScriptLinesRevealed ? 'Skryť všetky moje repliky' : 'Odkryť všetky moje repliky';
  toggle.setAttribute('aria-pressed', String(allScriptLinesRevealed));

  const todayPanel = byId('scriptTodayPanel'); todayPanel.replaceChildren();
  const todayCopy = element('div'); todayCopy.append(element('p', 'script-today-kicker', 'Dnešný cieľ'), element('h2', '', isDailyTargetComplete(game, today) ? 'Dnešný cieľ je hotový' : `${replikaCount(target.speechIds.filter(id => !game.script.speeches.find(speech => speech.id === id)?.learnedAt).length)} v scenári`));
  const targetMinutes = target.speechIds.reduce((sum, id) => sum + estimateMinutes(game.script.speeches.find(speech => speech.id === id)?.text ?? ''), 0);
  todayCopy.append(element('p', 'muted-copy', target.speechIds.length ? `Súvislá dávka v pôvodnom poradí · približne ${targetMinutes} min` : game.daysOff.includes(today) ? 'Dnes máš označený voľný deň.' : 'Všetky repliky sú hotové.'));
  todayPanel.append(todayCopy);
  if (isDailyTargetComplete(game, today) && scriptOwnSpeeches(game).some(speech => !speech.learnedAt)) {
    const more = element('button', 'secondary', 'Pokračovať ďalej'); more.type = 'button';
    more.addEventListener('click', () => {
      const currentGame = findGame(game.id); if (!currentGame) return;
      extendDailyTarget(currentGame, today, nowIso()); persist(); renderScriptGame();
      requestAnimationFrame(() => byId('goToTodayTargetBtn').click());
    });
    todayPanel.append(more);
  }

  byId('scriptGameDeadline').value = game.deadline;
  const daysOff = byId('scriptGameDaysOff'); daysOff.replaceChildren();
  for (const date of game.daysOff) {
    const remove = element('button', '', `Voľno ${formatPlanDate(date)} ×`); remove.type = 'button';
    remove.setAttribute('aria-label', `Zrušiť voľný deň ${formatPlanDate(date)}`);
    remove.addEventListener('click', () => { game.daysOff = game.daysOff.filter(day => day !== date); game.updatedAt = nowIso(); persist(); renderScriptGame(true); });
    daysOff.append(remove);
  }

  const select = byId('scriptSectionSelect'); select.replaceChildren(new Option('Vyber časť', ''));
  for (const section of game.script.sections.filter(item => item.headingEntryId)) select.append(new Option(section.title, section.id));
  const documentBox = byId('scriptDocument'); documentBox.replaceChildren();
  const renderedSpeeches = new Set();
  for (const entry of game.script.entries) {
    if (entry.speechId) {
      if (renderedSpeeches.has(entry.speechId)) continue;
      renderedSpeeches.add(entry.speechId);
      const speech = game.script.speeches.find(item => item.id === entry.speechId);
      if (speech) documentBox.append(renderScriptSpeech(game, speech, targetIds));
      continue;
    }
    if (entry.type === 'heading') {
      const heading = element('section', 'script-section-heading'); heading.id = `script-section-${entry.sectionId}`;
      heading.append(element('h2', '', entry.text));
      if (game.script.sections.some(section => section.id === entry.sectionId && section.headingEntryId === entry.id)) {
        const focus = element('button', game.focusSectionId === entry.sectionId ? 'secondary active-focus' : 'text-button', game.focusSectionId === entry.sectionId ? 'Učím sa túto časť' : 'Učiť teraz'); focus.type = 'button';
        focus.setAttribute('aria-pressed', String(game.focusSectionId === entry.sectionId));
        focus.addEventListener('click', () => { setScriptFocus(game, entry.sectionId, today, nowIso()); persist(); renderScriptGame(true); });
        heading.append(focus);
      }
      documentBox.append(heading);
    } else if (entry.type === 'direction') {
      documentBox.append(element('p', 'script-direction', entry.rawText));
    } else {
      documentBox.append(element('p', `script-prose${entry.ambiguous ? ' ambiguous' : ''}`, entry.rawText));
    }
  }
  if (keepScroll) requestAnimationFrame(() => globalThis.scrollTo({ top: scrollTop, behavior: 'auto' }));
}

function openGame(id, tab) {
  const game = findGame(id); if (!game) return showGames();
  const changedGame = currentGameId !== id;
  if (changedGame) { activeGameTab = tab ?? 'plan'; revealedScriptSpeechIds.clear(); allScriptLinesRevealed = false; }
  else if (tab) activeGameTab = tab;
  currentGameId = id;
  if (game.mode === 'script') { showView('scriptGame'); renderScriptGame(); }
  else { showView('gameDetail'); renderGameDetail(); }
  if (changedGame) requestAnimationFrame(() => globalThis.scrollTo({ top: 0, behavior: 'auto' }));
}

function renderLibrary() {
  refreshReviewStatuses();
  syncLibraryTabs();
  for (const id of selectedRehearsalIds) {
    if (!findRehearsal(id)) selectedRehearsalIds.delete(id);
  }
  const list = byId('rehearsalList');
  list.replaceChildren();
  const sorted = appData.rehearsals.filter(item => item.type === activeLibraryTab && !item.gameId).sort((a, b) => {
    const aTime = a.lastOpenedAt ?? a.createdAt;
    const bTime = b.lastOpenedAt ?? b.createdAt;
    return String(bTime).localeCompare(String(aTime));
  });

  byId('libraryHeading').textContent = activeLibraryTab === 'scene' ? 'Scény' : 'Repliky';
  byId('newRehearsalBtn').setAttribute('aria-label', activeLibraryTab === 'scene' ? 'Pridať novú scénu' : 'Pridať novú repliku');
  byId('sceneImportBtn').classList.toggle('hidden', activeLibraryTab !== 'scene');
  const visibleIds = sorted.map(item => item.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedRehearsalIds.has(id));
  byId('selectLibraryBtn').textContent = selectionMode ? 'Zrušiť výber' : 'Označiť';
  byId('selectionActions').classList.toggle('hidden', !selectionMode);
  byId('selectionCount').textContent = `${selectedRehearsalIds.size} označených`;
  byId('selectAllLibraryBtn').textContent = allVisibleSelected ? 'Zrušiť označenie v karte' : 'Označiť všetko v karte';
  byId('deleteSelectedBtn').disabled = selectedRehearsalIds.size === 0;
  byId('emptyLibrary').classList.toggle('hidden', sorted.length > 0 || !byId('editorPanel').classList.contains('hidden') || !byId('sceneEditorPanel').classList.contains('hidden'));
  for (const rehearsal of sorted) list.append(createRehearsalCard(rehearsal));

  updateTodayTime();
}

function createRehearsalCard(rehearsal) {
  const card = element('article', 'rehearsal-card');
  const selected = selectedRehearsalIds.has(rehearsal.id);
  card.classList.toggle('selected', selectionMode && selected);
  const top = element('div', 'card-topline');
  const titleGroup = element('div', 'card-title-group');
  const title = element('h2', '', rehearsal.title);
  const metadata = rehearsal.type === 'scene'
    ? [rehearsal.character, `${rehearsal.parsed?.entries?.filter(entry => entry.type === 'speech').length ?? 0} replík`].join(' · ')
    : [rehearsal.play, rehearsal.character, rehearsal.scene].filter(Boolean).join(' · ');
  titleGroup.append(title);
  if (metadata) titleGroup.append(element('p', 'card-meta', metadata));

  const [statusLabel, statusClass] = statusInfo(rehearsal);
  top.append(titleGroup, element('span', `status-chip ${statusClass}`, statusLabel));

  if (selectionMode) {
    const selector = element('label', 'card-selector');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = selected;
    checkbox.setAttribute('aria-label', `Označiť ${rehearsal.title}`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedRehearsalIds.add(rehearsal.id);
      else selectedRehearsalIds.delete(rehearsal.id);
      renderLibrary();
    });
    selector.append(checkbox); top.prepend(selector);
  }

  const coverage = coverageFor(rehearsal);
  const info = element('div', 'card-info');
  info.append(
    element('span', '', `${coverage} % pokrytie`),
    element('span', '', `${formatDuration(activitySecondsFor(rehearsal.id))} · ${formatDate(rehearsal.lastOpenedAt)}`)
  );
  const track = element('div', 'mini-progress');
  const bar = element('span');
  bar.style.width = `${coverage}%`;
  track.append(bar);

  if (selectionMode) {
    card.append(top, info, track);
    return card;
  }

  const actions = element('div', 'card-actions');
  const primary = element('button', 'primary');
  primary.type = 'button';
  primary.textContent = rehearsal.status === 'inProgress'
    ? 'Pokračovať'
    : rehearsal.status === 'reviewDue'
      ? 'Spustiť kontrolu'
      : rehearsal.status === 'draft'
        ? 'Začať učiť'
        : 'Precvičiť znova';
  primary.addEventListener('click', () => openRehearsal(rehearsal.id));
  actions.append(primary);

  if (rehearsal.status === 'inProgress') {
    const restart = element('button', 'secondary', 'Začať odznova');
    restart.type = 'button';
    restart.addEventListener('click', () => confirmRestart(rehearsal.id));
    actions.append(restart);
  }

  const menu = element('details', 'card-menu');
  const summary = element('summary', '', 'Možnosti');
  const menuContent = element('div', 'card-menu-panel');
  const editButton = element('button', '', 'Upraviť');
  editButton.type = 'button';
  editButton.addEventListener('click', () => rehearsal.type === 'scene' ? openSceneEditor(rehearsal.id) : openEditor(rehearsal.id));
  const deleteButton = element('button', 'danger-text', 'Odstrániť');
  deleteButton.type = 'button';
  deleteButton.addEventListener('click', () => deleteRehearsal(rehearsal.id));
  menuContent.append(editButton, deleteButton);
  menu.append(summary, menuContent);
  actions.append(menu);

  card.append(top, info, track, actions);
  return card;
}

function openEditor(id = null) {
  editingRehearsalId = id;
  editingType = 'rehearsal';
  const rehearsal = id ? findRehearsal(id) : null;
  byId('editorHeading').textContent = rehearsal ? 'Upraviť repliku' : 'Nová replika';
  byId('rehearsalTitle').value = rehearsal?.title ?? '';
  byId('rehearsalText').value = rehearsal?.text ?? '';
  byId('rehearsalPlay').value = rehearsal?.play ?? '';
  byId('rehearsalCharacter').value = rehearsal?.character ?? '';
  byId('rehearsalScene').value = rehearsal?.scene ?? '';
  byId('editorPanel').classList.remove('hidden');
  byId('emptyLibrary').classList.add('hidden');
  byId('rehearsalTitle').focus();
}

function closeEditor() {
  editingRehearsalId = null;
  editingType = 'rehearsal';
  byId('rehearsalForm').reset();
  byId('editorPanel').classList.add('hidden');
  renderLibrary();
}

function updateScenePreview() {
  const preview = byId('scenePreview');
  const select = byId('sceneCharacter');
  const parsed = parseScene(byId('sceneText').value);
  preview.replaceChildren();
  select.replaceChildren();
  if (parsed.errors.length) {
    preview.textContent = parsed.errors[0];
    preview.classList.remove('hidden');
    select.append(new Option('Najprv oprav scenár', ''));
    select.disabled = true;
    return parsed;
  }
  preview.textContent = `Rozpoznané postavy: ${parsed.speakers.join(', ')} · ${parsed.entries.filter(entry => entry.type === 'speech').length} replík`;
  preview.classList.remove('hidden');
  select.append(new Option('Vyber postavu', ''));
  for (const speaker of parsed.speakers) select.append(new Option(speaker, speaker));
  select.disabled = false;
  return parsed;
}

function openSceneEditor(id = null) {
  editingRehearsalId = id;
  editingType = 'scene';
  const rehearsal = id ? findRehearsal(id) : null;
  byId('sceneEditorHeading').textContent = rehearsal ? 'Upraviť scénu' : 'Nová scéna';
  byId('sceneTitle').value = rehearsal?.title ?? '';
  byId('sceneText').value = rehearsal?.text ?? '';
  byId('sceneEditorPanel').classList.remove('hidden');
  byId('editorPanel').classList.add('hidden');
  updateScenePreview();
  if (rehearsal?.character) byId('sceneCharacter').value = rehearsal.character;
  byId('emptyLibrary').classList.add('hidden');
  byId('sceneTitle').focus();
}

function closeSceneEditor() {
  editingRehearsalId = null;
  editingType = 'rehearsal';
  byId('sceneForm').reset();
  byId('scenePreview').classList.add('hidden');
  byId('sceneEditorPanel').classList.add('hidden');
  renderLibrary();
}

function importSourceTitle(name = '') {
  return String(name).replace(/\.[^.]+$/u, '').trim() || 'Importovaný scenár';
}

function closeScriptImport() {
  const returnToGames = scriptImportState?.returnToGames;
  scriptImportState = null;
  byId('scriptImportForm').reset();
  byId('scriptImportPreview').replaceChildren();
  byId('scriptImportCharacter').replaceChildren();
  byId('scriptImportIssues').replaceChildren();
  byId('importDaysOff').replaceChildren();
  byId('gameImportOptions').classList.add('hidden');
  byId('confirmScriptImportBtn').classList.add('primary');
  byId('confirmScriptImportBtn').textContent = 'Vytvoriť hru';
  byId('confirmScriptImportBtn').disabled = true;
  byId('scriptImportPanel').classList.add('hidden');
  document.querySelector('.library-tabs').classList.remove('hidden');
  document.querySelector('.library-header-actions').classList.remove('hidden');
  if (returnToGames) showGames(); else renderLibrary();
}

function openScriptImport() {
  const returnToGames = currentView === 'games' || currentView === 'gameDetail';
  showView('library');
  byId('libraryHeading').textContent = returnToGames ? 'Nová hra' : 'Scény';
  document.querySelector('.library-tabs').classList.toggle('hidden', returnToGames);
  document.querySelector('.library-header-actions').classList.toggle('hidden', returnToGames);
  editingRehearsalId = null;
  byId('editorPanel').classList.add('hidden');
  byId('sceneEditorPanel').classList.add('hidden');
  byId('scriptImportPanel').classList.remove('hidden');
  byId('emptyLibrary').classList.add('hidden');
  byId('scriptImportFileButton').focus();
  scriptImportState = { returnToGames };
}

function collectUnknownResolutions() {
  return Object.fromEntries([...document.querySelectorAll('[data-import-type]')]
    .filter(select => select.value !== select.dataset.importDefault)
    .map(select => {
      const speaker = select.closest('.import-choice')?.querySelector('[data-import-speaker]')?.value;
      return [select.dataset.importType, select.value === 'speech' ? `speech:${speaker}` : select.value];
    }));
}

function renderScriptImportPreviewContent() {
  const preview = byId('scriptImportPreview');
  const character = byId('scriptImportCharacter').value;
  const issues = byId('scriptImportIssues');
  preview.replaceChildren(); issues.replaceChildren();
  if (!scriptImportState) return;
  const { sourceTitle, fingerprint } = scriptImportState;
  scriptImportState.resolutions = { ...scriptImportState.resolutions, ...collectUnknownResolutions() };
  const parsedDocument = parseScriptDocument(scriptImportState.paragraphs, scriptImportState.resolutions);
  scriptImportState.document = parsedDocument;
  if (!character) {
    preview.textContent = `Rozpoznané postavy: ${parsedDocument.speakers.join(', ')}. Vyber svoju postavu.`;
    return;
  }
  scriptImportState.draft = { script: parsedDocument, character };
  const ownLines = parsedDocument.speeches.filter(speech => speech.speaker === character).length;
  const duplicate = appData.games.some(game => game.importFingerprint === fingerprint && game.character === character);
  preview.append(element('strong', '', `${parsedDocument.entries.length} odsekov · ${parsedDocument.speeches.length} replík · ${ownLines} tvojich`));
  preview.append(element('p', 'muted-copy', duplicate ? 'Tento scenár s rovnakou postavou už v knižnici je. Import vytvorí samostatnú novú hru.' : `Zdroj: ${sourceTitle}. Každý odsek zostane na pôvodnom mieste.`));
  byId('gameImportOptions').classList.remove('hidden');
  if (!byId('scriptImportGameTitle').value) byId('scriptImportGameTitle').value = sourceTitle;
  if (!byId('scriptImportDeadline').value) { const deadline = new Date(); deadline.setDate(deadline.getDate() + 30); byId('scriptImportDeadline').value = localDateKey(deadline); }
  renderImportDaysOff();

  const ambiguousEntries = parsedDocument.entries.filter(entry => entry.ambiguous);
  if (ambiguousEntries.length) {
    issues.append(element('h3', '', `Nejasné bloky · ${ambiguousEntries.length}`));
    issues.append(element('p', 'field-help', 'Nemusíš ich opravovať. V scenári zostanú viditeľné ako text alebo pokračovanie repliky. Ak vieš, čo znamenajú, môžeš typ spresniť.'));
    for (const unknown of ambiguousEntries) {
      const row = element('div', 'import-choice');
      row.append(element('p', '', unknown.rawText));
      const select = element('select');
      select.dataset.importType = unknown.id;
      select.dataset.importDefault = unknown.type;
      select.setAttribute('aria-label', `Typ bloku: ${unknown.rawText}`);
      select.append(new Option(unknown.type === 'continuation' ? `Pokračovanie repliky ${unknown.speaker}` : 'Ponechať ako obyčajný text', unknown.type));
      select.append(new Option('Nadpis', 'heading'), new Option('Scénická poznámka', 'direction'), new Option('Replika postavy…', 'speech'));
      select.value = scriptImportState.resolutions[unknown.id] ?? unknown.type;
      select.addEventListener('change', () => renderScriptImportPreview());
      row.append(select);
      if (select.value === 'speech') {
        const speaker = element('select'); speaker.dataset.importSpeaker = unknown.id; speaker.setAttribute('aria-label', `Postava bloku: ${unknown.rawText}`);
        for (const name of parsedDocument.speakers) speaker.append(new Option(name, name));
        speaker.value = character; speaker.addEventListener('change', () => renderScriptImportPreview()); row.append(speaker);
      }
      issues.append(row);
    }
  }
  byId('confirmScriptImportBtn').disabled = ownLines === 0;
}

function renderScriptImportPreview() {
  const preview = byId('scriptImportPreview');
  const confirmButton = byId('confirmScriptImportBtn');
  preview.classList.remove('import-preview-error');
  preview.setAttribute('aria-busy', 'true');
  confirmButton.disabled = true;
  byId('gameImportOptions').classList.add('hidden');
  try {
    renderScriptImportPreviewContent();
  } catch (error) {
    byId('scriptImportIssues').replaceChildren();
    preview.replaceChildren(
      element('strong', '', 'Náhľad sa nepodarilo pripraviť.'),
      element('p', 'muted-copy', 'Obnov stránku a vyber DOCX znova. Ak problém zostane, exportuj zálohu pred ďalším pokusom.')
    );
    preview.classList.add('import-preview-error');
    setLibraryMessage(`Import sa zastavil: ${error.message}`, true);
    console.error('Script import preview failed', error);
  } finally {
    preview.setAttribute('aria-busy', 'false');
  }
}

function renderImportDaysOff() {
  const box = byId('importDaysOff'); box.replaceChildren();
  for (const date of scriptImportState?.daysOff ?? []) { const button = element('button', '', `Voľno ${formatPlanDate(date)} ×`); button.type = 'button'; button.addEventListener('click', () => { scriptImportState.daysOff = scriptImportState.daysOff.filter(day => day !== date); renderImportDaysOff(); }); box.append(button); }
}

function prepareScriptImport(paragraphs, sourceTitle) {
  const parsedDocument = parseScriptDocument(paragraphs);
  if (!parsedDocument.speakers.length) throw new Error('Scenár neobsahuje rozpoznateľné repliky v tvare MENO: text.');
  scriptImportState = {
    paragraphs,
    document: parsedDocument,
    sourceTitle: importSourceTitle(sourceTitle),
    fingerprint: fingerprintScript(paragraphs),
    resolutions: {},
    daysOff: [],
    draft: null,
    returnToGames: scriptImportState?.returnToGames ?? false
  };
  const select = byId('scriptImportCharacter');
  select.replaceChildren(); select.append(new Option('Vyber postavu', ''));
  for (const speaker of parsedDocument.speakers) select.append(new Option(speaker, speaker));
  select.disabled = false;
  byId('scriptImportPreview').classList.remove('hidden');
  renderScriptImportPreview();
}

function confirmScriptImport() {
  const state = scriptImportState;
  const character = byId('scriptImportCharacter').value;
  if (!state?.draft || !character) return;
  const title = byId('scriptImportGameTitle').value.trim(); const deadline = byId('scriptImportDeadline').value;
  if (!title || !deadline) { setLibraryMessage('Doplň názov hry a termín učenia.', true); return; }
  const timestamp = nowIso(); const gameId = newId();
  const script = parseScriptDocument(state.paragraphs, state.resolutions);
  const ownCount = script.speeches.filter(speech => speech.speaker === character).length;
  if (!ownCount) { setLibraryMessage(`V scenári sa nenašla žiadna replika postavy ${character}.`, true); return; }
  appData.games.push(normalizeGame({
    id: gameId, mode: 'script', title, character, importFingerprint: state.fingerprint,
    startDate: localDateKey(), deadline, daysOff: state.daysOff, focusSectionId: null,
    script, dailyTargets: {}, createdAt: timestamp, updatedAt: timestamp
  }));
  if (!persist(`Hra „${title}“ bola uložená s celým scenárom a ${ownCount} replikami postavy ${character}.`)) return;
  closeScriptImport();
  openGame(gameId);
}

async function saveRehearsalFromForm(event) {
  event.preventDefault();
  const title = byId('rehearsalTitle').value.trim();
  const text = byId('rehearsalText').value.trim();
  if (!title || !text) return;
  const parsed = parseText(text);
  if (!parsed.sentences.length) {
    setLibraryMessage('Text neobsahuje žiadnu použiteľnú vetu.', true);
    return;
  }

  const existing = editingRehearsalId ? findRehearsal(editingRehearsalId) : null;
  if (existing && existing.text !== text && existing.session) {
    const confirmed = await askConfirm(
      'Zmena textu vynuluje rozpracovaný postup tejto repliky. Historický čas zostane zachovaný.',
      'Zmeniť text'
    );
    if (!confirmed) return;
  }

  const timestamp = nowIso();
  if (existing) {
    const textChanged = existing.text !== text;
    Object.assign(existing, {
      title,
      text,
      play: byId('rehearsalPlay').value.trim(),
      character: byId('rehearsalCharacter').value.trim(),
      scene: byId('rehearsalScene').value.trim(),
      updatedAt: timestamp
    });
    if (textChanged) {
      existing.parsed = parsed;
      existing.parserVersion = PARSER_VERSION;
      existing.session = null;
      existing.status = 'draft';
      existing.reviewDueAt = null;
      existing.reviewCompletedAt = null;
    }
  } else {
    appData.rehearsals.push(normalizeRehearsal({
      id: newId(),
      title,
      text,
      play: byId('rehearsalPlay').value.trim(),
      character: byId('rehearsalCharacter').value.trim(),
      scene: byId('rehearsalScene').value.trim(),
      parsed,
      parserVersion: PARSER_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp
    }));
  }

  if (persist('Replika bola uložená.')) closeEditor();
}

async function saveSceneFromForm(event) {
  event.preventDefault();
  const title = byId('sceneTitle').value.trim();
  const text = byId('sceneText').value.trim();
  const character = byId('sceneCharacter').value;
  let parsed;
  try { parsed = validateScene(parseScene(text), character); } catch (error) { setLibraryMessage(error.message, true); return; }
  const existing = editingRehearsalId ? findRehearsal(editingRehearsalId) : null;
  const changed = existing && (existing.text !== text || existing.character !== character);
  if (changed && existing.session) {
    const confirmed = await askConfirm('Zmena scenára alebo postavy vynuluje rozpracovaný postup tejto scény. Historický čas zostane zachovaný.', 'Zmeniť scénu');
    if (!confirmed) return;
  }
  const timestamp = nowIso();
  if (existing) {
    Object.assign(existing, { title, text, character, parsed, parserVersion: SCENE_PARSER_VERSION, updatedAt: timestamp });
    if (changed) Object.assign(existing, { session: null, status: 'draft', reviewDueAt: null, reviewCompletedAt: null });
  } else {
    appData.rehearsals.push(normalizeRehearsal({ id: newId(), type: 'scene', title, text, character, parsed, parserVersion: SCENE_PARSER_VERSION, createdAt: timestamp, updatedAt: timestamp }));
  }
  if (persist('Scéna bola uložená.')) closeSceneEditor();
}

async function deleteRehearsal(id) {
  const rehearsal = findRehearsal(id);
  if (!rehearsal) return;
  const confirmed = await askConfirm(
    `Odstrániť repliku „${rehearsal.title}“? Celkový čas zostane v súhrne, ale repliku nebude možné obnoviť bez backupu.`,
    'Odstrániť'
  );
  if (!confirmed) return;
  appData.rehearsals = appData.rehearsals.filter(item => item.id !== id);
  for (const day of Object.values(appData.activity.days)) delete day.byRehearsal?.[id];
  persist('Replika bola odstránená.');
  renderLibrary();
}

function toggleSelectionMode() {
  selectionMode = !selectionMode;
  if (!selectionMode) selectedRehearsalIds.clear();
  renderLibrary();
}

function toggleSelectAllVisible() {
  const visible = appData.rehearsals.filter(item => item.type === activeLibraryTab);
  const allSelected = visible.length > 0 && visible.every(item => selectedRehearsalIds.has(item.id));
  for (const rehearsal of visible) {
    if (allSelected) selectedRehearsalIds.delete(rehearsal.id);
    else selectedRehearsalIds.add(rehearsal.id);
  }
  renderLibrary();
}

async function deleteSelectedRehearsals() {
  const ids = [...selectedRehearsalIds].filter(id => findRehearsal(id));
  if (!ids.length) return;
  const confirmed = await askConfirm(
    `Odstrániť ${ids.length} označených položiek? Ich rozpracované učenie nebude možné obnoviť bez backupu.`,
    'Odstrániť označené'
  );
  if (!confirmed) return;
  const idSet = new Set(ids);
  appData.rehearsals = appData.rehearsals.filter(item => !idSet.has(item.id));
  for (const day of Object.values(appData.activity.days)) {
    for (const id of ids) delete day.byRehearsal?.[id];
  }
  selectedRehearsalIds.clear();
  selectionMode = false;
  persist(`${ids.length} položiek bolo odstránených.`);
  renderLibrary();
}

async function confirmRestart(id) {
  const rehearsal = findRehearsal(id);
  if (!rehearsal) return;
  const confirmed = await askConfirm('Rozpracovaný postup sa vynuluje. Text a štatistiky zostanú zachované.', 'Začať odznova');
  if (confirmed) openRehearsal(id, true);
}

function openRehearsal(id, restart = false) {
  const rehearsal = findRehearsal(id);
  if (!rehearsal) return;
  byId('backToLibraryBtn').textContent = rehearsal.gameId && findGame(rehearsal.gameId) ? '← Hra' : '← Knižnica';
  const parsed = ensureParsed(rehearsal);
  if (rehearsal.type === 'scene') {
    try { validateScene(parsed, rehearsal.character); } catch (error) { setLibraryMessage(error.message, true); return; }
    const resumable = rehearsal.session?.status === 'active';
    if (rehearsal.status === 'reviewDue' && (!resumable || rehearsal.session?.kind !== 'review') && !restart) {
      rehearsal.session = createSceneReviewSession(parsed, rehearsal.character);
    } else if (restart || !resumable) {
      rehearsal.session = createSceneSession(parsed, rehearsal.character);
      rehearsal.status = 'inProgress';
    }
    rehearsal.lastOpenedAt = nowIso(); rehearsal.updatedAt = rehearsal.lastOpenedAt; currentRehearsalId = rehearsal.id;
    persist(); showView('training'); renderTraining(); byId('trainingHeading').focus(); return;
  }
  if (!parsed.sentences.length) {
    setLibraryMessage('Táto replika nemá použiteľný text.', true);
    return;
  }

  const resumable = rehearsal.session?.status === 'active';
  if (rehearsal.status === 'reviewDue' && (!resumable || rehearsal.session?.kind !== 'review') && !restart) {
    rehearsal.session = createReviewSession(parsed);
  } else if (restart || !resumable) {
    rehearsal.session = createSession(parsed);
    rehearsal.status = 'inProgress';
  }

  rehearsal.lastOpenedAt = nowIso();
  rehearsal.updatedAt = rehearsal.lastOpenedAt;
  currentRehearsalId = rehearsal.id;
  persist();
  showView('training');
  renderTraining();
  byId('trainingHeading').focus();
}

function titleForTask(task, total) {
  if (task.phase === 'learn') return `Veta ${task.range.start + 1} z ${total}`;
  if (task.phase === 'bridge') return `Krátky prechod · ${task.range.start + 1}–${task.range.end + 1}`;
  if (task.phase === 'checkpoint') return `Kontrola doteraz · 1–${task.range.end + 1}`;
  if (task.phase === 'block') return `Súvislý úsek · ${task.range.start + 1}–${task.range.end + 1}`;
  return 'Celá replika';
}

function instructionForTask(task, kind) {
  if (task.display === 'rate') return 'Porovnaj svoj pokus so správnym textom.';
  if (task.display === 'recall') {
    return kind === 'review'
      ? 'Kontrola po odstupe: povedz celú repliku bez predchádzajúceho čítania.'
      : 'Povedz text nahlas spamäti. Potom odkry správne znenie.';
  }
  if (task.phase === 'learn') return 'Prečítaj si vetu. Keď si pripravený, skús ju povedať spamäti.';
  if (task.phase === 'bridge') return 'Prečítaj si prechod. Potom ho povedz v súvislosti.';
  if (task.phase === 'checkpoint') return 'Prepoj doteraz naučenú časť od začiatku. Scénické poznámky sú iba viditeľný kontext.';
  if (task.phase === 'block') return 'Prečítaj si úsek. Potom ho skús povedať bez textu.';
  return 'Prečítaj si repliku. Potom ju povedz celú bez textu.';
}

function renderContext(rehearsal, task) {
  const contextBox = byId('contextBox');
  const previousIndex = task.range.start - 1;
  if (previousIndex < 0 || task.phase === 'all') {
    contextBox.replaceChildren();
    contextBox.classList.add('hidden');
    return;
  }
  const label = element('strong', '', task.phase === 'learn' ? 'Predchádzajúca veta: ' : 'Čo tomu predchádza: ');
  contextBox.replaceChildren(label, document.createTextNode(rehearsal.session.sentences[previousIndex]));
  contextBox.classList.remove('hidden');
}

function renderTraining() {
  const rehearsal = currentRehearsal();
  if (!rehearsal?.session) return showLibrary();
  if (rehearsal.type === 'scene') return renderSceneTraining(rehearsal);

  byId('trainingHeading').textContent = rehearsal.title;
  byId('sceneScript').classList.add('hidden');
  byId('sentence').classList.remove('hidden');
  byId('trainingMeta').textContent = [rehearsal.play, rehearsal.character, rehearsal.scene].filter(Boolean).join(' · ');
  const finished = rehearsal.session.status === 'done';
  byId('activeTraining').classList.toggle('hidden', finished);
  byId('completionCard').classList.toggle('hidden', !finished);
  if (finished) return renderCompletion(rehearsal);

  const task = getCurrentTask(rehearsal.session);
  byId('statusText').textContent = titleForTask(task, rehearsal.session.sentences.length);
  byId('instruction').textContent = instructionForTask(task, rehearsal.session.kind);
  renderContext(rehearsal, task);

  const covered = Math.max(0, task.knownEnd + 1);
  const percentage = Math.min(100, Math.round((covered / rehearsal.session.sentences.length) * 100));
  byId('coverageText').textContent = `${percentage} %`;
  byId('trainingProgress').style.width = `${percentage}%`;
  byId('trainingProgress').setAttribute('aria-valuenow', String(percentage));

  const isRecall = task.display === 'recall';
  byId('sentence').textContent = isRecall ? maskMemorizedText(task.text, task.hintLevel) : task.text;
  byId('sentence').classList.toggle('masked', isRecall);

  const isRating = task.display === 'rate';
  byId('presentationControls').classList.toggle('hidden', isRating);
  byId('ratingBox').classList.toggle('hidden', !isRating);
  byId('presentationBtn').textContent = isRecall ? 'Odkryť správny text' : 'Skúsiť spamäti';
  byId('hintBtn').disabled = !isRecall || task.hintLevel >= 2;
  byId('backStepBtn').disabled = rehearsal.session.history.length === 0;
  if (isRating) byId('ratingBox').querySelector('button').focus();
}

function sceneInstruction(task, kind) {
  if (task.display === 'rate') return 'Porovnaj svoj pokus so správnym priebehom.';
  if (task.display === 'recall') return kind === 'review'
    ? 'Povedz celú scénu podľa nástupov kolegov.'
    : 'Povedz svoje repliky podľa nástupov kolegov. Potom odkry správny priebeh.';
  if (task.phase === 'learn') return 'Prečítaj si zvýraznenú repliku. Potom ju povedz podľa nástupu kolegu.';
  if (task.phase === 'checkpoint') return 'Prejdi od začiatku doteraz naučenú časť scény.';
  return 'Prejdi celú scénu podľa nástupov kolegov.';
}

function renderSceneScript(rehearsal, task) {
  const script = byId('sceneScript'); script.replaceChildren(); script.classList.remove('hidden');
  const state = rehearsal.session.state;
  for (const [index, entry] of rehearsal.session.entries.entries()) {
    if (entry.type === 'direction') { script.append(element('p', 'scene-direction', entry.stageDirection)); continue; }
    const row = element('article', `scene-line ${entry.speaker === rehearsal.character ? 'scene-own' : 'scene-partner'}`);
    row.dataset.sceneIndex = String(index);
    row.append(element('strong', 'scene-speaker', entry.speaker));
    const text = element('p', 'scene-text');
    const inScope = index <= task.scopeEnd;
    const isOwn = entry.speaker === rehearsal.character;
    const current = index === task.targetIndex;
    const learned = task.learnedIndices.includes(index);
    const inRound = isOwn && task.phase !== 'learn' && inScope;
    const shouldMask = isOwn && (task.phase === 'learn'
      ? (current ? task.display === 'recall' : !learned)
      : (!inScope || task.display === 'recall'));
    if (shouldMask) { text.textContent = maskMemorizedText(entry.text, current ? task.hintLevel : 0); text.classList.add('scene-masked'); }
    else text.textContent = entry.text;
    if (current) row.classList.add('scene-current');
    if (inRound) row.classList.add('scene-round-target');
    row.append(text); script.append(row);
  }
  const target = task.targetIndex ?? task.scopeEnd;
  queueMicrotask(() => script.querySelector(`[data-scene-index="${target}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

function renderSceneTraining(rehearsal) {
  const finished = rehearsal.session.status === 'done';
  byId('trainingHeading').textContent = rehearsal.title;
  byId('trainingMeta').textContent = rehearsal.character;
  byId('activeTraining').classList.toggle('hidden', finished); byId('completionCard').classList.toggle('hidden', !finished);
  if (finished) return renderCompletion(rehearsal);
  const task = getCurrentSceneTask(rehearsal.session);
  byId('statusText').textContent = task.phase === 'learn' ? `Replika ${task.learnedIndices.length + 1} z ${task.totalOwn}` : task.phase === 'checkpoint' ? 'Kontrola doteraz' : 'Celá scéna';
  byId('instruction').textContent = sceneInstruction(task, rehearsal.session.kind);
  byId('contextBox').classList.add('hidden'); byId('sentence').classList.add('hidden');
  renderSceneScript(rehearsal, task);
  const percentage = Math.round((task.learnedIndices.length / task.totalOwn) * 100);
  byId('coverageText').textContent = `${percentage} %`; byId('trainingProgress').style.width = `${percentage}%`; byId('trainingProgress').setAttribute('aria-valuenow', String(percentage));
  const rating = task.display === 'rate'; byId('presentationControls').classList.toggle('hidden', rating); byId('ratingBox').classList.toggle('hidden', !rating);
  byId('presentationBtn').textContent = task.display === 'recall' ? 'Odkryť správny priebeh' : 'Skúsiť spamäti';
  byId('hintBtn').disabled = task.display !== 'recall' || task.hintLevel >= 2 || task.phase !== 'learn';
  byId('backStepBtn').disabled = rehearsal.session.history.length === 0;
  if (rating) byId('ratingBox').querySelector('button').focus();
}

function saveSessionAndRender() {
  const rehearsal = currentRehearsal();
  if (!rehearsal) return;
  rehearsal.updatedAt = nowIso();
  persist();
  renderTraining();
}

function handleRating(rating) {
  const rehearsal = currentRehearsal();
  if (!rehearsal?.session) return;
  const wasActive = rehearsal.session.status === 'active';
  rehearsal.session = rehearsal.type === 'scene'
    ? rateSceneTask(rehearsal.session, rating)
    : rateCurrentTask(rehearsal.session, rating);
  if (rehearsal.session.state.lastAttemptAssisted) rehearsal.stats.assistedAttempts += 1;
  if (wasActive && rehearsal.session.status === 'done') completeRehearsal(rehearsal);
  saveSessionAndRender();
}

function completeRehearsal(rehearsal) {
  const timestamp = nowIso();
  rehearsal.stats.completedRuns += 1;
  if (rehearsal.session.kind === 'review') {
    rehearsal.status = 'reviewVerified';
    rehearsal.reviewCompletedAt = timestamp;
  } else {
    rehearsal.status = 'completed';
    rehearsal.reviewDueAt = nextLocalDayIso();
    rehearsal.reviewCompletedAt = null;
  }
  rehearsal.updatedAt = timestamp;
}

function renderCompletion(rehearsal) {
  const reviewed = rehearsal.status === 'reviewVerified';
  const label = rehearsal.type === 'scene' ? 'Scéna' : 'Replika';
  byId('completionTitle').textContent = reviewed ? 'Kontrola splnená' : `${label} prejdená`;
  byId('completionText').textContent = reviewed
    ? `Celú ${label.toLowerCase()} si vybavil po časovom odstupe.`
    : `Zajtra sa v knižnici objaví kontrola ${label.toLowerCase()} bez predchádzajúceho čítania.`;
  byId('completionCard').focus();
}

function showLibrary() {
  currentRehearsalId = null;
  showView('library');
  renderLibrary();
}

function returnFromTraining() {
  const rehearsal = currentRehearsal();
  if (rehearsal?.gameId && findGame(rehearsal.gameId)) openGame(rehearsal.gameId);
  else showLibrary();
}

function renderProgress() {
  const summary = summarizeActivity(appData.activity, new Date());
  byId('statsToday').textContent = formatDuration(summary.todaySeconds);
  byId('stats7Days').textContent = formatDuration(summary.last7Seconds);
  byId('stats30Days').textContent = formatDuration(summary.last30Seconds);
  byId('statsAllTime').textContent = formatDuration(summary.allTimeSeconds);
  byId('statsCompleted').textContent = String(
    appData.rehearsals.reduce((sum, item) => sum + item.stats.completedRuns, 0)
  );

  const chart = byId('weekChart');
  chart.replaceChildren();
  const max = Math.max(1, ...summary.days.map(day => day.seconds));
  for (const day of summary.days) {
    const column = element('div', 'day-column');
    const value = element('span', 'day-value', day.seconds ? formatDuration(day.seconds) : '0');
    const barTrack = element('div', 'day-bar-track');
    const bar = element('span', 'day-bar');
    bar.style.height = day.seconds ? `${Math.max(8, (day.seconds / max) * 100)}%` : '2px';
    barTrack.append(bar);
    const label = element('span', 'day-label', new Intl.DateTimeFormat('sk-SK', { weekday: 'short' }).format(day.date).replace('.', ''));
    column.append(value, barTrack, label);
    chart.append(column);
  }

  const statsList = byId('rehearsalStats');
  statsList.replaceChildren();
  if (!appData.rehearsals.length) {
    statsList.append(element('p', 'muted-copy', 'Po pridaní repliky sa tu zobrazí jej čas a pokrytie.'));
  }
  for (const rehearsal of [...appData.rehearsals].sort((a, b) => activitySecondsFor(b.id) - activitySecondsFor(a.id))) {
    const row = element('article', 'rehearsal-stat-row');
    const text = element('div');
    text.append(element('h3', '', rehearsal.title), element('p', '', `${coverageFor(rehearsal)} % pokrytie · ${rehearsal.stats.completedRuns} dokončení`));
    row.append(text, element('strong', '', formatDuration(activitySecondsFor(rehearsal.id))));
    statsList.append(row);
  }
}

function showProgress() {
  currentRehearsalId = null;
  showView('progress');
  renderProgress();
}

function updateTodayTime() {
  const summary = summarizeActivity(appData.activity, new Date());
  byId('todayTime').textContent = `Dnes ${formatDuration(summary.todaySeconds)}`;
}

function downloadBackup(data = appData, prefix = 'replika-backup') {
  const backup = createBackup(data);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `${prefix}-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

async function importBackupFile(file) {
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Backup je väčší než povolených 10 MB.');
    const backup = validateBackup(await file.text());
    const count = backup.data.rehearsals.length;
    const confirmed = await askConfirm(
      `Backup obsahuje ${formatRehearsalCount(count)}. Import nahradí celú lokálnu knižnicu aj štatistiky. Pred zmenou sa automaticky stiahne bezpečnostná záloha.`,
      'Nahradiť dáta'
    );
    if (!confirmed) return;
    downloadBackup(appData, 'replika-pred-importom');
    appData = replaceFromBackup(backup);
    appData.rehearsals = appData.rehearsals.map(normalizeRehearsal);
    appData.games = (appData.games ?? []).map(normalizeGame);
    storageHealthy = true;
    currentRehearsalId = null;
    setLibraryMessage('Backup bol obnovený.');
    showLibrary();
  } catch (error) {
    setLibraryMessage(`Import zlyhal: ${error.message}`, true);
    showLibrary();
  }
}

function askConfirm(message, confirmLabel = 'Potvrdiť') {
  const dialog = byId('confirmDialog');
  if (typeof dialog.showModal !== 'function') return Promise.resolve(globalThis.confirm(message));
  byId('confirmMessage').textContent = message;
  byId('confirmAcceptBtn').textContent = confirmLabel;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}

const tracker = new VisibleActivityTracker({
  onRecord(start, end, rehearsalId) {
    appData.activity = addActivityInterval(appData.activity, start, end, rehearsalId);
    if (rehearsalId) {
      const rehearsal = findRehearsal(rehearsalId);
      if (rehearsal) rehearsal.stats.activeSeconds = activitySecondsFor(rehearsalId);
    }
    persist();
    updateTodayTime();
    if (currentView === 'progress') renderProgress();
  }
});

byId('brandButton').addEventListener('click', showGames);
byId('standaloneLibraryBtn').addEventListener('click', () => { activeLibraryTab = 'rehearsal'; showLibrary(); });
byId('backFromLibraryBtn').addEventListener('click', showGames);
for (const [id, tab] of [['gamePlanTab', 'plan'], ['gameScenesTab', 'scenes'], ['gameLinesTab', 'lines'], ['gameProgressTab', 'progress']]) byId(id).addEventListener('click', () => showGameTab(tab, true));
byId('gameDetailView').querySelector('.game-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const tabs = ['plan', 'scenes', 'lines', 'progress']; const direction = event.key === 'ArrowRight' ? 1 : -1; showGameTab(tabs[(tabs.indexOf(activeGameTab) + direction + tabs.length) % tabs.length], true);
});
byId('rehearsalsTabBtn').addEventListener('click', () => { activeLibraryTab = 'rehearsal'; syncLibraryTabs(); renderLibrary(); });
byId('scenesTabBtn').addEventListener('click', () => { activeLibraryTab = 'scene'; syncLibraryTabs(); renderLibrary(); });
byId('newRehearsalBtn').addEventListener('click', () => activeLibraryTab === 'scene' ? openSceneEditor() : openEditor());
byId('emptyAddBtn').addEventListener('click', () => activeLibraryTab === 'scene' ? openSceneEditor() : openEditor());
byId('selectLibraryBtn').addEventListener('click', toggleSelectionMode);
byId('selectAllLibraryBtn').addEventListener('click', toggleSelectAllVisible);
byId('deleteSelectedBtn').addEventListener('click', deleteSelectedRehearsals);
byId('sceneImportBtn').addEventListener('click', openScriptImport);
byId('gamesImportBtn').addEventListener('click', openScriptImport);
byId('emptyGamesImportBtn').addEventListener('click', openScriptImport);
byId('backToGamesBtn').addEventListener('click', showGames);
byId('backFromScriptGameBtn').addEventListener('click', showGames);
byId('gameDeadline').addEventListener('change', () => { const game = findGame(currentGameId); if (!game || !byId('gameDeadline').value) return; game.deadline = byId('gameDeadline').value; game.updatedAt = nowIso(); persist(); renderGameDetail(); });
byId('gameNewMaterialEnd').addEventListener('change', () => { const game = findGame(currentGameId); const date = byId('gameNewMaterialEnd').value; if (!game || !date) return; game.newMaterialEnd = date > game.deadline ? game.deadline : date; game.updatedAt = nowIso(); persist(); renderGameDetail(); });
byId('addGameDayOffBtn').addEventListener('click', () => { const game = findGame(currentGameId); const date = byId('gameDayOff').value; if (!game || !date || game.daysOff.includes(date)) return; game.daysOff.push(date); game.daysOff.sort(); game.updatedAt = nowIso(); byId('gameDayOff').value = ''; persist(); renderGameDetail(); });
byId('gameLineSearch').addEventListener('input', () => { const game = findGame(currentGameId); if (game) renderAllGameUnits(game); });
byId('gameActFilter').addEventListener('change', () => { const game = findGame(currentGameId); if (game) renderAllGameUnits(game); });
byId('cancelEditorBtn').addEventListener('click', closeEditor);
byId('rehearsalForm').addEventListener('submit', saveRehearsalFromForm);
byId('cancelSceneEditorBtn').addEventListener('click', closeSceneEditor);
byId('sceneForm').addEventListener('submit', saveSceneFromForm);
byId('sceneText').addEventListener('input', updateScenePreview);
byId('cancelScriptImportBtn').addEventListener('click', closeScriptImport);
byId('scriptImportFileButton').addEventListener('click', () => byId('scriptImportFile').click());
byId('scriptImportFile').addEventListener('change', async event => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    prepareScriptImport(await readDocxParagraphs(file), file.name);
    setLibraryMessage('DOCX je pripravený. Vyber svoju postavu.');
  } catch (error) {
    setLibraryMessage(`DOCX sa nepodarilo načítať: ${error.message}`, true);
  }
  event.target.value = '';
});
byId('scriptImportCharacter').addEventListener('change', () => {
  renderScriptImportPreview();
});
byId('addImportDayOffBtn').addEventListener('click', () => { const date = byId('scriptImportDayOff').value; if (!scriptImportState || !date || scriptImportState.daysOff.includes(date)) return; scriptImportState.daysOff.push(date); scriptImportState.daysOff.sort(); byId('scriptImportDayOff').value = ''; renderImportDaysOff(); });
byId('confirmScriptImportBtn').addEventListener('click', confirmScriptImport);
byId('toggleAllScriptLinesBtn').addEventListener('click', () => { allScriptLinesRevealed = !allScriptLinesRevealed; if (!allScriptLinesRevealed) revealedScriptSpeechIds.clear(); renderScriptGame(true); });
byId('goToTodayTargetBtn').addEventListener('click', () => {
  const game = findGame(currentGameId); const target = game?.dailyTargets?.[localDateKey()];
  const id = target?.speechIds.find(speechId => !game.script.speeches.find(speech => speech.id === speechId)?.learnedAt) ?? target?.speechIds[0];
  const node = id ? byId(`script-speech-${id}`) : byId('scriptTodayPanel');
  node?.scrollIntoView({ block: 'center', behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  node?.focus?.({ preventScroll: true });
});
byId('scriptSectionSelect').addEventListener('change', event => {
  if (!event.target.value) return;
  byId(`script-section-${event.target.value}`)?.scrollIntoView({ block: 'start', behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  event.target.value = '';
});
byId('scriptGameDeadline').addEventListener('change', event => {
  const game = findGame(currentGameId); if (!game || game.mode !== 'script' || !event.target.value) return;
  game.deadline = event.target.value; game.updatedAt = nowIso(); persist(); renderScriptGame(true);
});
byId('addScriptGameDayOffBtn').addEventListener('click', () => {
  const game = findGame(currentGameId); const input = byId('scriptGameDayOff'); const date = input.value;
  if (!game || game.mode !== 'script' || !date || game.daysOff.includes(date)) return;
  game.daysOff.push(date); game.daysOff.sort(); game.updatedAt = nowIso(); input.value = ''; persist(); renderScriptGame(true);
});

document.addEventListener('click', event => {
  closeMenusOutside(document, event.target);
});

byId('pasteTextBtn').addEventListener('click', async () => {
  try {
    byId('rehearsalText').value = await navigator.clipboard.readText();
    byId('rehearsalText').focus();
  } catch {
    setLibraryMessage('Prehliadač nepovolil vloženie. Použi príkaz Vložiť v zariadení.', true);
  }
});
byId('pasteSceneBtn').addEventListener('click', async () => {
  try { byId('sceneText').value = await navigator.clipboard.readText(); updateScenePreview(); byId('sceneText').focus(); }
  catch { setLibraryMessage('Prehliadač nepovolil vloženie. Použi príkaz Vložiť v zariadení.', true); }
});

byId('exportBtn').addEventListener('click', () => {
  downloadBackup();
  byId('appMenu').removeAttribute('open');
  setLibraryMessage('Záloha bola pripravená na stiahnutie.');
});
byId('importBtn').addEventListener('click', () => {
  byId('appMenu').removeAttribute('open');
  byId('importFile').click();
});
byId('resetAppBtn').addEventListener('click', async () => {
  byId('appMenu').removeAttribute('open');
  const confirmed = await askConfirm(
    'Vymazať všetky hry, samostatné texty, progres a nastavenia v tomto prehliadači? Túto akciu nemožno vrátiť späť bez exportovanej zálohy.',
    'Vymazať všetko'
  );
  if (!confirmed) return;
  clearAppData(globalThis.localStorage);
  globalThis.location.reload();
});
byId('importFile').addEventListener('change', async event => {
  const [file] = event.target.files;
  if (file) await importBackupFile(file);
  event.target.value = '';
});

byId('backToLibraryBtn').addEventListener('click', returnFromTraining);
byId('restartTrainingBtn').addEventListener('click', () => confirmRestart(currentRehearsalId));
byId('completionLibraryBtn').addEventListener('click', returnFromTraining);
byId('completionRestartBtn').addEventListener('click', () => openRehearsal(currentRehearsalId, true));

byId('presentationBtn').addEventListener('click', () => {
  const rehearsal = currentRehearsal();
  if (!rehearsal) return;
  rehearsal.session = rehearsal.type === 'scene' ? advanceScenePresentation(rehearsal.session) : advancePresentation(rehearsal.session);
  saveSessionAndRender();
});
byId('hintBtn').addEventListener('click', () => {
  const rehearsal = currentRehearsal();
  if (!rehearsal) return;
  rehearsal.session = rehearsal.type === 'scene' ? giveSceneHint(rehearsal.session) : giveHint(rehearsal.session);
  saveSessionAndRender();
});
byId('backStepBtn').addEventListener('click', () => {
  const rehearsal = currentRehearsal();
  if (!rehearsal) return;
  rehearsal.session = rehearsal.type === 'scene' ? goBackScene(rehearsal.session) : goBack(rehearsal.session);
  saveSessionAndRender();
});
byId('repeatSegmentBtn').addEventListener('click', () => {
  const rehearsal = currentRehearsal();
  if (!rehearsal) return;
  rehearsal.session = rehearsal.type === 'scene' ? repeatSceneTask(rehearsal.session) : repeatCurrentTask(rehearsal.session);
  saveSessionAndRender();
});
for (const button of document.querySelectorAll('[data-rating]')) {
  button.addEventListener('click', () => handleRating(button.dataset.rating));
}

document.addEventListener('keydown', event => {
  if (currentView !== 'training') return;
  if (['TEXTAREA', 'INPUT', 'BUTTON', 'SUMMARY'].includes(document.activeElement?.tagName)) return;
  const rehearsal = currentRehearsal();
  if (!rehearsal?.session || rehearsal.session.status === 'done') return;
  const task = rehearsal.type === 'scene' ? getCurrentSceneTask(rehearsal.session) : getCurrentTask(rehearsal.session);
  if (event.code === 'Space' && task.display !== 'rate') {
    event.preventDefault();
    rehearsal.session = rehearsal.type === 'scene' ? advanceScenePresentation(rehearsal.session) : advancePresentation(rehearsal.session);
    saveSessionAndRender();
  } else if (task.display === 'rate') {
    const ratings = { '1': 'bad', '2': 'almost', '3': 'good' };
    if (ratings[event.key]) handleRating(ratings[event.key]);
  }
});

window.addEventListener('pagehide', () => {
  if (globalThis.localStorage?.getItem(APP_STORAGE_KEY) !== null) persist();
});
window.addEventListener('pageshow', () => tracker.start());

refreshReviewStatuses();
renderGames();
tracker.start();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js?v=24', { updateViaCache: 'none' }).catch(() => {});
}
