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
