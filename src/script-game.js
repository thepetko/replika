import { availableDates, estimateMinutes } from './game-plan.js?v=25';

const SPEAKER_LINE = /^\s*([\p{Lu}\d][\p{Lu}\p{M}\d .,'’\-–—/]{0,50}?)(?:\s*(\([^)]{0,200}\)))?\s*:\s*(.*)$/u;
const STRUCTURE_HEADING = /^(?:(?:prvé|prvý|druhé|druhý|tretie|tretí|štvrté|štvrtý|piate|piaty|šieste|šiesty|siedme|siedmy|ôsme|ôsmy|deviate|deviaty|desiate|desiaty|\d+\.?|[IVXLCDM]+\.?)\s+)?(?:dejstvo|obraz)(?:\s*[:.\-–—].*)?$|^(?:sc[eé]na|výstup)\s+(?:\d+|[IVXLCDM]+)(?:\s*[:.\-–—].*)?$|^epil[oó]g\s*:?$/iu;

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function normalizeSpeaker(value) {
  return cleanText(value).replace(/\s+/g, ' ').toLocaleUpperCase('sk');
}

function looksLikeHeading(text, style = '') {
  return (/(?:^|\s)(?:heading|nadpis|title)(?:\s|$)/iu.test(style) && text.length <= 120)
    || STRUCTURE_HEADING.test(text)
    || (/^[\p{Lu}\p{M}\d .,'’\-–—]+$/u.test(text) && text.length <= 80);
}

function createsSection(text, style = '') {
  return STRUCTURE_HEADING.test(text);
}

function looksLikeDirection(text) {
  return /^(?:\(|\[|<).*(?:\)|\]|>)$/u.test(text)
    || /^(?:poznámka|scénická poznámka|didaskália)\s*:/iu.test(text)
    || /^sc[eé]na predstavuje\b/iu.test(text)
    || ((text.match(/\b(?:vybeh\w*|vstúp\w*|odchádz\w*|vrhne\w*|vyrúti\w*|zažen\w*|ťahá|vlečie|spadne|vstane)\b/giu) ?? []).length >= 2);
}

function resolutionFor(resolutions, id) {
  const value = resolutions?.[id];
  if (!value) return null;
  if (typeof value === 'string') {
    if (value.startsWith('speech:')) return { type: 'speech', speaker: value.slice(7) };
    return { type: value };
  }
  return value;
}

/**
 * Prevedie každý neprázdny zdrojový odsek na presne jeden stabilný záznam.
 * Zoskupenie pokračovaní do repliky je odvodené a nikdy nemaže zdrojové bloky.
 */
export function parseScriptDocument(paragraphs = [], resolutions = {}) {
  const entries = [];
  const sections = [{ id: 'section-start', title: 'Začiatok', headingEntryId: null, order: 0 }];
  const speeches = [];
  const speakers = [];
  let section = sections[0];
  let activeSpeech = null;

  paragraphs.forEach((paragraph, sourceIndex) => {
    const rawText = String(paragraph?.text ?? '');
    const text = cleanText(rawText);
    if (!text) return;
    const id = `entry-${sourceIndex}`;
    const style = String(paragraph?.style ?? '');
    const forced = resolutionFor(resolutions, id);
    const match = text.match(SPEAKER_LINE);
    let type = forced?.type;
    let speaker = forced?.speaker ? normalizeSpeaker(forced.speaker) : '';
    let content = text;
    let ambiguous = false;

    if (!type) {
      if (match) {
        type = 'speech';
        speaker = normalizeSpeaker(match[1]);
        content = cleanText([match[2], match[3]].filter(Boolean).join(' '));
      } else if (looksLikeHeading(text, style)) {
        type = 'heading';
      } else if (looksLikeDirection(text)) {
        type = 'direction';
      } else if (activeSpeech) {
        type = 'continuation';
        speaker = activeSpeech.speaker;
        ambiguous = true;
      } else {
        type = 'unknown';
        ambiguous = true;
      }
    } else if (type === 'speech') {
      if (match && !speaker) speaker = normalizeSpeaker(match[1]);
      if (match) content = cleanText([match[2], match[3]].filter(Boolean).join(' '));
      if (!speaker) {
        type = 'unknown';
        ambiguous = true;
      }
    }

    if (type === 'heading' && createsSection(text, style)) {
      section = { id: `section-${sourceIndex}`, title: text, headingEntryId: id, order: sections.length };
      sections.push(section);
    }

    if (type === 'speech') {
      activeSpeech = {
        id: `speech-${sourceIndex}`,
        speaker,
        sectionId: section.id,
        entryIds: [],
        text: '',
        order: speeches.length,
        learnedAt: null
      };
      speeches.push(activeSpeech);
      if (!speakers.includes(speaker)) speakers.push(speaker);
    } else if (type !== 'continuation') {
      activeSpeech = null;
    }

    const speechId = (type === 'speech' || type === 'continuation') ? activeSpeech?.id ?? null : null;
    const entry = {
      id, sourceIndex, rawText, text: content, style, type,
      speaker: speaker || null,
      sectionId: section.id,
      speechId,
      ambiguous
    };
    entries.push(entry);
    if (activeSpeech && speechId) {
      activeSpeech.entryIds.push(id);
      activeSpeech.text = activeSpeech.text ? `${activeSpeech.text}\n${content}` : content;
    }
  });

  return { entries, sections, speeches, speakers };
}

export function scriptOwnSpeeches(game) {
  const character = normalizeSpeaker(game?.character);
  return (game?.script?.speeches ?? []).filter(speech => normalizeSpeaker(speech.speaker) === character);
}

export function scriptProgress(game) {
  const speeches = scriptOwnSpeeches(game);
  const learned = speeches.filter(speech => speech.learnedAt).length;
  return { learned, total: speeches.length, percent: speeches.length ? Math.round(learned / speeches.length * 100) : 0 };
}

export function scriptDailyPace(game, today) {
  const remaining = scriptOwnSpeeches(game).filter(speech => !speech.learnedAt);
  const remainingMinutes = remaining.reduce((sum, speech) => sum + estimateMinutes(speech.text), 0);
  const dates = availableDates(today, game?.deadline, game?.daysOff ?? []);
  return {
    availableDays: dates.length,
    remainingMinutes,
    requiredMinutes: dates.length ? Math.ceil(remainingMinutes / dates.length) : remainingMinutes,
    impossible: remaining.length > 0 && dates.length === 0
  };
}

function learningSequence(game) {
  const own = scriptOwnSpeeches(game);
  const focusId = game?.focusSectionId;
  if (!focusId || !own.some(speech => speech.sectionId === focusId && !speech.learnedAt)) return own;
  return [
    ...own.filter(speech => speech.sectionId === focusId),
    ...own.filter(speech => speech.sectionId !== focusId)
  ];
}

function nextBatch(game, today, excludedIds = new Set(), afterId = null) {
  const sequence = learningSequence(game);
  const afterIndex = afterId ? sequence.findIndex(speech => speech.id === afterId) : -1;
  let candidates = sequence.slice(afterIndex + 1).filter(speech => !speech.learnedAt && !excludedIds.has(speech.id));
  if (!candidates.length && afterIndex >= 0) {
    candidates = sequence.filter(speech => !speech.learnedAt && !excludedIds.has(speech.id));
  }
  if (!candidates.length) return [];

  const focusId = game?.focusSectionId;
  if (focusId && candidates[0].sectionId === focusId) {
    candidates = candidates.filter(speech => speech.sectionId === focusId);
  }
  const targetMinutes = Math.max(1, scriptDailyPace(game, today).requiredMinutes);
  const selected = [];
  let minutes = 0;
  for (const speech of candidates) {
    selected.push(speech.id);
    minutes += estimateMinutes(speech.text);
    if (minutes >= targetMinutes) break;
  }
  return selected;
}

export function ensureDailyTarget(game, today, createdAt = new Date().toISOString()) {
  game.dailyTargets ??= {};
  if (game.dailyTargets[today]) return game.dailyTargets[today];
  const target = { speechIds: nextBatch(game, today), createdAt };
  game.dailyTargets[today] = target;
  return target;
}

export function extendDailyTarget(game, today, extendedAt = new Date().toISOString()) {
  const target = ensureDailyTarget(game, today, extendedAt);
  const excluded = new Set(target.speechIds);
  const additions = nextBatch(game, today, excluded, target.speechIds.at(-1) ?? null);
  target.speechIds.push(...additions);
  target.extendedAt = extendedAt;
  return target;
}

export function setScriptSpeechLearned(game, speechId, learnedAt = new Date().toISOString()) {
  const speech = game?.script?.speeches?.find(item => item.id === speechId);
  if (!speech || normalizeSpeaker(speech.speaker) !== normalizeSpeaker(game.character)) return false;
  speech.learnedAt = learnedAt || null;
  game.updatedAt = new Date().toISOString();
  return true;
}

export function setScriptFocus(game, sectionId, today, changedAt = new Date().toISOString()) {
  game.focusSectionId = sectionId || null;
  game.dailyTargets ??= {};
  const current = game.dailyTargets[today];
  const learnedIds = (current?.speechIds ?? []).filter(id => game.script.speeches.find(speech => speech.id === id)?.learnedAt);
  const replacement = nextBatch(game, today, new Set(learnedIds));
  game.dailyTargets[today] = { speechIds: [...learnedIds, ...replacement], createdAt: current?.createdAt ?? changedAt, changedAt };
  game.updatedAt = changedAt;
  return game.dailyTargets[today];
}

export function isDailyTargetComplete(game, date) {
  const ids = game?.dailyTargets?.[date]?.speechIds ?? [];
  return ids.length > 0 && ids.every(id => game.script.speeches.find(speech => speech.id === id)?.learnedAt);
}
