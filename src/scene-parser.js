export const SCENE_PARSER_VERSION = 1;

const SPEAKER_LINE = /^\s*([^:\n()]{1,80}):\s*(\S.*)$/u;
const DIRECTION_LINE = /^\s*(\([^()]+\))\s*$/u;

export function parseScene(text) {
  const entries = [];
  const errors = [];
  let current = null;

  for (const [offset, rawLine] of String(text ?? '').replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const direction = line.match(DIRECTION_LINE);
    if (direction) {
      entries.push({ type: 'direction', stageDirection: direction[1] });
      current = null;
      continue;
    }
    const speaker = line.match(SPEAKER_LINE);
    if (speaker) {
      current = { type: 'speech', speaker: speaker[1].trim(), text: speaker[2].trim() };
      entries.push(current);
      continue;
    }
    if (current) {
      current.text = `${current.text} ${line}`;
    } else {
      errors.push(`Riadok ${offset + 1} nemá meno postavy ani nenadväzuje na repliku.`);
    }
  }

  const speakers = [...new Set(entries.filter(entry => entry.type === 'speech').map(entry => entry.speaker))];
  if (speakers.length < 2) errors.push('Scéna musí obsahovať aspoň dve postavy v tvare MENO: replika.');
  if (!entries.some(entry => entry.type === 'speech')) errors.push('Scéna neobsahuje žiadnu repliku.');
  return { entries, speakers, errors };
}

export function validateScene(parsed, character) {
  if (!parsed?.entries?.length || parsed.errors?.length) throw new Error(parsed?.errors?.[0] ?? 'Scénu sa nepodarilo spracovať.');
  if (!parsed.speakers.includes(character)) throw new Error('Vyber postavu, ktorá má v scéne aspoň jednu repliku.');
  if (!parsed.entries.some(entry => entry.type === 'speech' && entry.speaker === character)) {
    throw new Error('Vybraná postava nemá v scéne repliku.');
  }
  return parsed;
}
