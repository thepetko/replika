const PROTECTED_DOT = '\uE000';
export const PARSER_VERSION = 2;
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

function splitBlock(rawBlock) {
  const normalized = rawBlock.replace(/\s+/g, ' ').trim();
  const protectedText = protectAbbreviations(normalized);
  const matches = protectedText.match(/[^.!?]+(?:[.!?]+["“”’»]?|$)/g) ?? [];

  return matches
    .map(sentence => sentence.replaceAll(PROTECTED_DOT, '.').trim())
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

  for (const rawBlock of rawBlocks) {
    const blockSentences = splitBlock(rawBlock);
    if (!blockSentences.length) continue;

    const start = sentences.length;
    sentences.push(...blockSentences);
    blocks.push({ start, end: sentences.length - 1 });
  }

  return { sentences, blocks };
}
