export function splitMemorizerLines(text) {
  return String(text ?? '').trim().split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
}

export function splitMemorizerTokens(line) {
  return String(line).match(/\S+|\s+/gu) ?? [];
}

export function visiblePrefix(word, count) {
  return Array.from(word).slice(0, count).join('');
}

export function isWordToken(token) {
  return /[\p{L}\p{N}]/u.test(token);
}

export function visibleWordHint(index, percent) {
  if (percent === 25) return index % 4 === 0;
  if (percent === 50) return index % 2 === 0;
  return index % 4 !== 3;
}
