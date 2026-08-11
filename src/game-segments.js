import { estimateMinutes } from './game-plan.js';

function splitLong(text, maxWords = 70) {
  const sentences = String(text).match(/[^.!?]+[.!?]+[”"')\]]*|[^.!?]+$/gu) ?? [String(text)];
  const parts = []; let current = '';
  for (const sentence of sentences) {
    const next = `${current} ${sentence}`.trim();
    if (current && (next.match(/[\p{L}\p{N}]+/gu) ?? []).length > maxWords) { parts.push(current); current = sentence.trim(); }
    else current = next;
  }
  if (current) parts.push(current);
  return parts;
}

export function createStudyUnits(scenes, character, makeId) {
  const units = []; let pending = null;
  const flush = () => { if (pending) { pending.minutes = estimateMinutes(pending.text); pending.order = units.length; units.push(pending); pending = null; } };
  for (const scene of scenes) {
    flush();
    for (const line of scene.ownLines) {
      const parts = splitLong(line.text);
      for (const part of parts) {
        const minutes = estimateMinutes(part);
        if (minutes < 10 && pending && pending.sceneTitle === scene.title && pending.minutes + minutes <= 25) {
          pending.text = `${pending.text}\n${part}`;
          pending.lineCount += 1;
          pending.minutes = estimateMinutes(pending.text);
        } else {
          flush();
          pending = { id: makeId(), sceneTitle: scene.title, section: scene.section, text: part, lineCount: 1, minutes };
        }
      }
    }
  }
  flush();
  return units;
}

export function splitUnit(units, id, makeId) {
  const index = units.findIndex(unit => unit.id === id);
  if (index < 0) return units;
  const unit = units[index]; const parts = splitLong(unit.text, 35);
  if (parts.length < 2) return units;
  const replacements = parts.map((text, partIndex) => ({ ...unit, id: makeId(), order: Number(unit.order ?? index) + partIndex / parts.length, text, minutes: estimateMinutes(text), completedAt: null }));
  return [...units.slice(0, index), ...replacements, ...units.slice(index + 1)];
}

export function mergeUnitWithNext(units, id) {
  const index = units.findIndex(unit => unit.id === id);
  if (index < 0 || !units[index + 1] || units[index].sceneTitle !== units[index + 1].sceneTitle) return units;
  const first = units[index], second = units[index + 1];
  const merged = { ...first, text: `${first.text}\n${second.text}`, lineCount: first.lineCount + second.lineCount, minutes: estimateMinutes(`${first.text} ${second.text}`), completedAt: null };
  return [...units.slice(0, index), merged, ...units.slice(index + 2)];
}
