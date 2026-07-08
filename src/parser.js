const PROTECTED_DOT = '\uE000';
const PROTECTED_QUESTION = '\uE001';
const PROTECTED_EXCLAMATION = '\uE002';
export const PARSER_VERSION = 3;
const COMMON_ABBREVIATIONS = [
  'p.', 'pp.', 'napr.', 'atď.', 'resp.', 'tzv.', 'č.', 'ods.',
  'prof.', 'doc.', 'ing.', 'mgr.', 'dr.'
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function protectAbbreviations(text) {
  let protectedText = text;

  for (const abbreviation of COMMON_ABBREVIATIONS) {
    const pattern = new RegExp(`\\b${escapeRegExp(abbreviation)}`, 'giu');
    protectedText = protectedText.replace(pattern, match => match.replaceAll('.', PROTECTED_DOT));
  }

  protectedText = protectedText.replace(
    /\b([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])\.(?=\s*[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])/gu,
    `$1${PROTECTED_DOT}`
  );

  return protectedText;
}

function protectStageDirections(text) {
  return text.replace(/\([^()]*\)/g, direction => direction
    .replaceAll('.', PROTECTED_DOT)
    .replaceAll('?', PROTECTED_QUESTION)
    .replaceAll('!', PROTECTED_EXCLAMATION));
}

function restoreProtectedPunctuation(text) {
  return text
    .replaceAll(PROTECTED_DOT, '.')
    .replaceAll(PROTECTED_QUESTION, '?')
    .replaceAll(PROTECTED_EXCLAMATION, '!');
}

function isStageDirectionOnly(sentence) {
  return /^\([^()]*\)$/s.test(sentence.trim());
}

function splitBlock(rawBlock) {
  const normalized = rawBlock.replace(/\s+/g, ' ').trim();
  const protectedText = protectStageDirections(protectAbbreviations(normalized));
  const matches = protectedText.match(/[^.!?]+(?:[.!?]+["“”’»]?|$)/g) ?? [];

  return matches
    .map(sentence => restoreProtectedPunctuation(sentence).trim())
    .filter(Boolean);
}

export function parseText(text) {
  const rawBlocks = String(text ?? '')
    .replace(/\r/g, '')
    .split(/\n\s*\n+/)
    .map(block => block.trim())
    .filter(Boolean);

  const sentences = [];
  const blocks = [];
  let pendingDirections = [];

  for (const rawBlock of rawBlocks) {
    const blockSentences = [];
    for (const sentence of splitBlock(rawBlock)) {
      if (isStageDirectionOnly(sentence)) {
        pendingDirections.push(sentence);
        continue;
      }

      blockSentences.push([...pendingDirections, sentence].join(' '));
      pendingDirections = [];
    }
    if (!blockSentences.length) continue;

    const start = sentences.length;
    sentences.push(...blockSentences);
    blocks.push({ start, end: sentences.length - 1 });
  }

  if (pendingDirections.length && sentences.length) {
    sentences[sentences.length - 1] += ` ${pendingDirections.join(' ')}`;
  }

  return { sentences, blocks };
}
