const SPEAKER_LINE = /^\s*([^:\n()]{1,80}?)(?:\s+(\([^\n]+\)))?\s*:\s*(\S.*)?$/u;
const DIRECTION_LINE = /^\s*(\([^\n]+\))\s*$/u;
const HEADING_STYLE = /^(?:heading(?:\b|\d)|title)$/iu;
const HEADING_TEXT = /^(?:prol[oó]g|epil[oó]g|(?:prv[ée]|druh[ée]|tretie|štvrt[ée]|piate|šieste|siedme|ôsme|deviate|desiate)\s+dejstvo|dejstvo\s+\S+|sc[eé]na\s+\S+)[:.]?$/iu;
const EXIT_WORDS = /\b(odchádza|odíde|odbehne|zájde|vychádza|odplazí sa|odletí|opúšťa)\b/iu;

function clean(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function isHeading(paragraph) {
  const text = clean(paragraph.text);
  return Boolean(text) && (HEADING_STYLE.test(paragraph.style ?? '') || HEADING_TEXT.test(text));
}

function isLikelySpeaker(name) {
  const value = clean(name);
  if (!value || value.length > 80 || /[.!?]/u.test(value)) return false;
  const letters = value.replace(/[^\p{L}]/gu, '');
  return letters.length > 0 && value === value.toLocaleUpperCase('sk-SK');
}

export function normalizeScriptParagraphs(paragraphs) {
  const entries = [];
  const unknowns = [];
  let currentSpeech = null;
  let contentStarted = false;

  for (const [index, paragraph] of (paragraphs ?? []).entries()) {
    const text = clean(paragraph?.text);
    if (!text) continue;
    if (isHeading(paragraph)) {
      if (!contentStarted && !/^heading(?:\b|\d)/iu.test(paragraph?.style ?? '')) continue;
      entries.push({ type: 'heading', text, sourceIndex: index });
      currentSpeech = null;
      continue;
    }
    const direction = text.match(DIRECTION_LINE);
    if (direction) {
      entries.push({ type: 'direction', text: direction[1], sourceIndex: index });
      currentSpeech = null;
      continue;
    }
    const speaker = text.match(SPEAKER_LINE);
    if (speaker && isLikelySpeaker(speaker[1])) {
      const stageDirection = clean(speaker[2]);
      const speechText = clean(speaker[3]);
      if (!speechText && !stageDirection) {
        unknowns.push({ id: `unknown-${index}`, text, sourceIndex: index });
        currentSpeech = null;
        continue;
      }
      const entry = { type: 'speech', speaker: clean(speaker[1]), text: [stageDirection, speechText].filter(Boolean).join(' '), sourceIndex: index };
      entries.push(entry);
      currentSpeech = entry;
      contentStarted = true;
      continue;
    }
    if (currentSpeech && contentStarted) {
      currentSpeech.text = `${currentSpeech.text} ${text}`.trim();
      continue;
    }
    if (!contentStarted) continue;
    const unknown = { type: 'unknown', id: `unknown-${index}`, text, sourceIndex: index };
    entries.push(unknown);
    unknowns.push(unknown);
    currentSpeech = null;
  }

  const speakers = [...new Set(entries.filter(entry => entry.type === 'speech').map(entry => entry.speaker))];
  return { entries, speakers, unknowns };
}

export function applyUnknownResolutions(document, resolutions = {}, character = '') {
  return {
    ...document,
    entries: document.entries.flatMap(entry => {
      if (entry.type !== 'unknown') return [entry];
      const choice = resolutions[entry.id] ?? 'context';
      if (choice === 'skip') return [];
      if (choice === 'character' && character) return [{ type: 'speech', speaker: character, text: entry.text, sourceIndex: entry.sourceIndex }];
      return [{ type: 'direction', text: `(${entry.text})`, sourceIndex: entry.sourceIndex }];
    })
  };
}

function sceneText(entries) {
  return entries.map(entry => {
    if (entry.type === 'speech') return `${entry.speaker}: ${entry.text}`;
    return entry.text;
  }).join('\n');
}

function closesOnExit(entry, character) {
  return entry.type === 'speech' && entry.speaker === character && EXIT_WORDS.test(entry.text);
}

function formatCharacterList(characters) {
  if (characters.length < 2) return characters[0] ?? '';
  if (characters.length === 2) return `${characters[0]} a ${characters[1]}`;
  return `${characters.slice(0, -1).join(', ')} a ${characters.at(-1)}`;
}

export function createPresenceScenes(document, character, options = {}) {
  const absenceLimit = options.absenceLimit ?? 3;
  const scenes = [];
  let section = '';
  let collected = [];
  let foreignTurns = 0;
  let hasOwnSpeech = false;
  let lastPartner = '';
  let lastForeignEntry = null;

  const finish = () => {
    if (!hasOwnSpeech) return;
    const lastOwnIndex = collected.map(entry => entry.type === 'speech' && entry.speaker === character).lastIndexOf(true);
    const sceneEntries = collected.slice(0, lastOwnIndex + 1);
    const ownLines = sceneEntries.filter(entry => entry.type === 'speech' && entry.speaker === character);
    if (!ownLines.length) return;
    const label = section || 'Úvod';
    const speakers = [character, ...new Set(sceneEntries
      .filter(entry => entry.type === 'speech' && entry.speaker !== character)
      .map(entry => entry.speaker))];
    scenes.push({
      title: `${label} · ${formatCharacterList(speakers)}`,
      section: label,
      character,
      entries: sceneEntries,
      text: sceneText(sceneEntries),
      ownLines
    });
    collected = [];
    foreignTurns = 0;
    hasOwnSpeech = false;
    lastPartner = '';
    lastForeignEntry = null;
  };

  for (const entry of document.entries) {
    if (entry.type === 'heading') {
      finish();
      section = entry.text;
      continue;
    }
    if (entry.type === 'speech' && entry.speaker === character) {
      const partnerBeforeOwn = lastForeignEntry?.speaker ?? '';
      const changedPartner = foreignTurns >= 2 && lastPartner && lastForeignEntry?.speaker && lastForeignEntry.speaker !== lastPartner;
      if (hasOwnSpeech && (foreignTurns >= absenceLimit || changedPartner)) {
        const leadIn = lastForeignEntry ? [lastForeignEntry] : [];
        finish();
        collected.push(...leadIn);
      }
      collected.push(entry);
      hasOwnSpeech = true;
      if (partnerBeforeOwn) lastPartner = partnerBeforeOwn;
      foreignTurns = 0;
      lastForeignEntry = null;
      if (closesOnExit(entry, character)) finish();
      continue;
    }
    if (!hasOwnSpeech) continue;
    collected.push(entry);
    if (entry.type === 'speech') {
      foreignTurns += 1;
      lastForeignEntry = entry;
    }
  }
  finish();
  return scenes;
}

function countWords(text) {
  return (clean(text).match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

function difficultyFor(line) {
  const text = line.text;
  const words = countWords(text);
  const sentences = (text.match(/[.!?]+(?:[”"')\]]*)/gu) ?? []).length;
  const interruptions = (text.match(/(?:—|–|\.\.\.|\.{2,})/gu) ?? []).length;
  const directions = (text.match(/\([^)]*\)/gu) ?? []).length;
  const normalizedWords = (text.toLocaleLowerCase('sk-SK').match(/\p{L}{4,}/gu) ?? []);
  const repeated = new Set(normalizedWords).size < normalizedWords.length;
  let score = words >= 60 ? 4 : words >= 35 ? 2 : 0;
  if (sentences >= 3) score += 1;
  if (interruptions >= 2) score += 1;
  if (directions) score += 1;
  if (repeated) score += 1;
  const reasons = [];
  if (words >= 35) reasons.push(`${words} slov`);
  if (sentences >= 3) reasons.push(`${sentences} viet`);
  if (interruptions >= 2) reasons.push('prerušovaný rytmus');
  if (directions) reasons.push('scénická poznámka');
  if (repeated) reasons.push('opakovania');
  return { score, words, reasons };
}

export function recommendStandaloneRehearsals(scenes, character) {
  const seen = new Set();
  return scenes.flatMap(scene => scene.ownLines).filter(line => {
    if (seen.has(line.sourceIndex)) return false;
    seen.add(line.sourceIndex);
    return true;
  }).map(line => ({ ...line, ...difficultyFor(line) }))
    .filter(candidate => candidate.words >= 35 || candidate.score >= 2)
    .sort((a, b) => b.score - a.score || b.words - a.words);
}

export function fingerprintScript(paragraphs) {
  let hash = 2166136261;
  for (const char of (paragraphs ?? []).map(paragraph => `${paragraph.style ?? ''}|${paragraph.text ?? ''}`).join('\n')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `script-${(hash >>> 0).toString(36)}`;
}
