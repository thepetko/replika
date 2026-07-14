import { addActivityInterval, summarizeActivity, VisibleActivityTracker } from './activity-tracker.js';
import {
  advancePresentation,
  createReviewSession,
  createSession,
  getCurrentTask,
  giveHint,
  goBack,
  rateCurrentTask,
  repeatCurrentTask
} from './learning-engine.js';
import { parseText, PARSER_VERSION } from './parser.js';
import { parseScene, SCENE_PARSER_VERSION, validateScene } from './scene-parser.js';
import {
  applyUnknownResolutions,
  createPresenceScenes,
  fingerprintScript,
  normalizeScriptParagraphs,
  recommendStandaloneRehearsals
} from './script-importer.js';
import { readDocxParagraphs } from './docx-reader.js';
import {
  advanceScenePresentation, createSceneReviewSession, createSceneSession, getCurrentSceneTask,
  giveSceneHint, goBackScene, rateSceneTask, repeatSceneTask
} from './scene-learning-engine.js';
import {
  createBackup,
  createEmptyAppData,
  getLegacyText,
  loadAppData,
  migrateLegacyData,
  replaceFromBackup,
  saveAppData,
  validateBackup
} from './storage.js';
import { closeMenusOutside, maskMemorizedText } from './ui-interactions.js';

const byId = id => document.getElementById(id);
const views = {
  library: byId('libraryView'),
  progress: byId('progressView'),
  training: byId('trainingView')
};

let appData;
let storageHealthy = true;
let currentView = 'library';
let currentRehearsalId = null;
let editingRehearsalId = null;
let editingType = 'rehearsal';
let activeLibraryTab = 'rehearsal';
let legacyDismissed = false;
let scriptImportState = null;
let selectionMode = false;
const selectedRehearsalIds = new Set();

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

try {
  appData = loadAppData();
  appData.rehearsals = appData.rehearsals.map(normalizeRehearsal);
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

function showView(name) {
  currentView = name;
  for (const [viewName, view] of Object.entries(views)) {
    view.classList.toggle('hidden', viewName !== name);
  }
  const inTraining = name === 'training';
  byId('bottomNav').classList.toggle('hidden', inTraining);
  const activeNav = name === 'progress' ? 'progress' : activeLibraryTab;
  const navItems = {
    rehearsal: byId('libraryNavBtn'),
    scene: byId('scenesNavBtn'),
    progress: byId('progressNavBtn')
  };
  for (const [key, button] of Object.entries(navItems)) {
    const active = key === activeNav;
    button.classList.toggle('active', active);
    button.toggleAttribute('aria-current', active);
  }
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

function renderLibrary() {
  refreshReviewStatuses();
  syncLibraryTabs();
  for (const id of selectedRehearsalIds) {
    if (!findRehearsal(id)) selectedRehearsalIds.delete(id);
  }
  const list = byId('rehearsalList');
  list.replaceChildren();
  const sorted = appData.rehearsals.filter(item => item.type === activeLibraryTab).sort((a, b) => {
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

  const legacyAvailable = Boolean(getLegacyText()) && !legacyDismissed;
  byId('legacyBanner').classList.toggle('hidden', !legacyAvailable);
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
  byId('bottomNav').classList.add('hidden');
  byId('emptyLibrary').classList.add('hidden');
  byId('rehearsalTitle').focus();
}

function closeEditor() {
  editingRehearsalId = null;
  editingType = 'rehearsal';
  byId('rehearsalForm').reset();
  byId('editorPanel').classList.add('hidden');
  byId('bottomNav').classList.remove('hidden');
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
  byId('bottomNav').classList.add('hidden');
  byId('emptyLibrary').classList.add('hidden');
  byId('sceneTitle').focus();
}

function closeSceneEditor() {
  editingRehearsalId = null;
  editingType = 'rehearsal';
  byId('sceneForm').reset();
  byId('scenePreview').classList.add('hidden');
  byId('sceneEditorPanel').classList.add('hidden');
  byId('bottomNav').classList.remove('hidden');
  renderLibrary();
}

function importSourceTitle(name = '') {
  return String(name).replace(/\.[^.]+$/u, '').trim() || 'Importovaný scenár';
}

function closeScriptImport() {
  scriptImportState = null;
  byId('scriptImportForm').reset();
  byId('scriptImportPreview').replaceChildren();
  byId('scriptImportCharacter').replaceChildren();
  byId('scriptImportIssues').replaceChildren();
  byId('scriptImportCandidates').replaceChildren();
  byId('confirmScriptImportBtn').disabled = true;
  byId('scriptImportPanel').classList.add('hidden');
  byId('bottomNav').classList.remove('hidden');
  renderLibrary();
}

function openScriptImport() {
  editingRehearsalId = null;
  byId('editorPanel').classList.add('hidden');
  byId('sceneEditorPanel').classList.add('hidden');
  byId('scriptImportPanel').classList.remove('hidden');
  byId('bottomNav').classList.add('hidden');
  byId('emptyLibrary').classList.add('hidden');
  byId('scriptImportFileButton').focus();
}

function collectUnknownResolutions() {
  return Object.fromEntries([...document.querySelectorAll('[data-import-unknown]')].map(select => [select.dataset.importUnknown, select.value]));
}

function renderScriptImportPreview() {
  const preview = byId('scriptImportPreview');
  const character = byId('scriptImportCharacter').value;
  const issues = byId('scriptImportIssues');
  const candidates = byId('scriptImportCandidates');
  preview.replaceChildren(); issues.replaceChildren(); candidates.replaceChildren();
  if (!scriptImportState) return;
  const { document: parsedDocument, sourceTitle, fingerprint } = scriptImportState;
  if (!character) {
    preview.textContent = `Rozpoznané postavy: ${parsedDocument.speakers.join(', ')}. Vyber svoju postavu.`;
    return;
  }
  scriptImportState.resolutions = { ...scriptImportState.resolutions, ...collectUnknownResolutions() };
  const resolved = applyUnknownResolutions(parsedDocument, scriptImportState.resolutions, character);
  const scenes = createPresenceScenes(resolved, character, { sourceTitle });
  const recommended = recommendStandaloneRehearsals(scenes, character);
  if (!scriptImportState.candidateSelectionInitialized) {
    scriptImportState.selectedCandidates = new Set(recommended.map(candidate => candidate.sourceIndex));
    scriptImportState.candidateSelectionInitialized = true;
  }
  scriptImportState.draft = { resolved, scenes, recommended };
  const ownLines = scenes.reduce((count, scene) => count + scene.ownLines.length, 0);
  const duplicate = appData.rehearsals.some(rehearsal => rehearsal.importFingerprint === fingerprint);
  preview.append(element('strong', '', `${scenes.length} scén · ${ownLines} vlastných replík`));
  preview.append(element('p', 'muted-copy', duplicate ? 'Tento scenár už bol pravdepodobne importovaný. Pokračovanie vytvorí ďalšie kópie.' : `Zdroj: ${sourceTitle}`));

  if (parsedDocument.unknowns.length) {
    issues.append(element('h3', '', 'Nejasné riadky'));
    issues.append(element('p', 'field-help', 'Pred uložením urči, ako má nástroj s týmito riadkami naložiť.'));
    for (const unknown of parsedDocument.unknowns) {
      const row = element('div', 'import-choice');
      row.append(element('p', '', unknown.text));
      const select = element('select');
      select.dataset.importUnknown = unknown.id;
      select.setAttribute('aria-label', `Spracovanie riadka: ${unknown.text}`);
      select.append(new Option('Zachovať ako poznámku', 'context'), new Option(`Priradiť postave ${character}`, 'character'), new Option('Vynechať', 'skip'));
      select.value = scriptImportState.resolutions[unknown.id] ?? 'context';
      select.addEventListener('change', () => renderScriptImportPreview());
      row.append(select); issues.append(row);
    }
  }

  if (recommended.length) {
    candidates.append(element('h3', '', 'Navrhnuté samostatné tréningy'));
    candidates.append(element('p', 'field-help', 'Replika ich neuloží bez tvojho zaškrtnutia.'));
    for (const candidate of recommended) {
      const row = element('label', 'import-choice import-candidate');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.value = String(candidate.sourceIndex);
      checkbox.checked = scriptImportState.selectedCandidates.has(candidate.sourceIndex);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) scriptImportState.selectedCandidates.add(candidate.sourceIndex);
        else scriptImportState.selectedCandidates.delete(candidate.sourceIndex);
      });
      const copy = element('span');
      copy.append(element('strong', '', candidate.text), element('small', '', candidate.reasons.join(' · ')));
      row.append(checkbox, copy); candidates.append(row);
    }
  } else {
    candidates.append(element('p', 'field-help', 'Nenašli sa repliky, ktoré by podľa dĺžky a štruktúry vyžadovali samostatný tréning.'));
  }
  byId('confirmScriptImportBtn').disabled = scenes.length === 0;
}

function prepareScriptImport(paragraphs, sourceTitle) {
  const parsedDocument = normalizeScriptParagraphs(paragraphs);
  if (!parsedDocument.speakers.length) throw new Error('Scenár neobsahuje rozpoznateľné repliky v tvare MENO: text.');
  scriptImportState = {
    document: parsedDocument,
    sourceTitle: importSourceTitle(sourceTitle),
    fingerprint: fingerprintScript(paragraphs),
    resolutions: {},
    selectedCandidates: new Set(),
    candidateSelectionInitialized: false,
    draft: null
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
  const timestamp = nowIso();
  const imported = [];
  for (const scene of state.draft.scenes) {
    const parsed = parseScene(scene.text);
    try { validateScene(parsed, character); } catch { continue; }
    imported.push(normalizeRehearsal({
      id: newId(), type: 'scene', title: scene.title, play: state.sourceTitle, character, scene: scene.section,
      text: scene.text, parsed, parserVersion: SCENE_PARSER_VERSION, importFingerprint: state.fingerprint,
      createdAt: timestamp, updatedAt: timestamp
    }));
  }
  const selected = new Set([...document.querySelectorAll('#scriptImportCandidates input[type="checkbox"]:checked')].map(input => Number(input.value)));
  const selectedCandidates = state.draft.recommended.filter(candidate => selected.has(candidate.sourceIndex));
  for (const [index, candidate] of selectedCandidates.entries()) {
    const parsed = parseText(candidate.text);
    if (!parsed.sentences.length) continue;
    imported.push(normalizeRehearsal({
      id: newId(), title: `${state.sourceTitle} · ${character} · replika ${index + 1}`, play: state.sourceTitle,
      character, scene: 'Samostatný tréning', text: candidate.text, parsed, parserVersion: PARSER_VERSION,
      importFingerprint: state.fingerprint, createdAt: timestamp, updatedAt: timestamp
    }));
  }
  if (!imported.length) { setLibraryMessage('Import nevytvoril žiadnu použiteľnú scénu.', true); return; }
  appData.rehearsals.push(...imported);
  if (!persist(`Import pridal ${imported.filter(item => item.type === 'scene').length} scén a ${selectedCandidates.length} samostatných tréningov.`)) return;
  activeLibraryTab = 'scene';
  closeScriptImport();
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

byId('brandButton').addEventListener('click', showLibrary);
byId('libraryNavBtn').addEventListener('click', () => { activeLibraryTab = 'rehearsal'; showLibrary(); });
byId('scenesNavBtn').addEventListener('click', () => { activeLibraryTab = 'scene'; showLibrary(); });
byId('progressNavBtn').addEventListener('click', showProgress);
byId('rehearsalsTabBtn').addEventListener('click', () => { activeLibraryTab = 'rehearsal'; syncLibraryTabs(); renderLibrary(); });
byId('scenesTabBtn').addEventListener('click', () => { activeLibraryTab = 'scene'; syncLibraryTabs(); renderLibrary(); });
byId('newRehearsalBtn').addEventListener('click', () => activeLibraryTab === 'scene' ? openSceneEditor() : openEditor());
byId('emptyAddBtn').addEventListener('click', () => activeLibraryTab === 'scene' ? openSceneEditor() : openEditor());
byId('selectLibraryBtn').addEventListener('click', toggleSelectionMode);
byId('selectAllLibraryBtn').addEventListener('click', toggleSelectAllVisible);
byId('deleteSelectedBtn').addEventListener('click', deleteSelectedRehearsals);
byId('sceneImportBtn').addEventListener('click', openScriptImport);
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
byId('prepareTextImportBtn').addEventListener('click', () => {
  const text = byId('scriptImportText').value;
  if (!text.trim()) { setLibraryMessage('Najprv vlož text scenára.', true); return; }
  prepareScriptImport(text.split(/\r?\n/u).map(line => ({ text: line, style: '' })), 'Vložený scenár');
});
byId('scriptImportCharacter').addEventListener('change', () => {
  if (scriptImportState) scriptImportState.candidateSelectionInitialized = false;
  renderScriptImportPreview();
});
byId('confirmScriptImportBtn').addEventListener('click', confirmScriptImport);

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

byId('importLegacyBtn').addEventListener('click', () => {
  const id = newId();
  appData = migrateLegacyData(appData, globalThis.localStorage, { id, title: 'Importovaná replika', now: nowIso() });
  appData.rehearsals = appData.rehearsals.map(normalizeRehearsal);
  setLibraryMessage('Starší text bol pridaný do knižnice.');
  renderLibrary();
});
byId('dismissLegacyBtn').addEventListener('click', () => {
  legacyDismissed = true;
  byId('legacyBanner').classList.add('hidden');
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
byId('importFile').addEventListener('change', async event => {
  const [file] = event.target.files;
  if (file) await importBackupFile(file);
  event.target.value = '';
});

byId('backToLibraryBtn').addEventListener('click', showLibrary);
byId('restartTrainingBtn').addEventListener('click', () => confirmRestart(currentRehearsalId));
byId('completionLibraryBtn').addEventListener('click', showLibrary);
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

window.addEventListener('pagehide', () => persist());
window.addEventListener('pageshow', () => tracker.start());

refreshReviewStatuses();
renderLibrary();
tracker.start();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
