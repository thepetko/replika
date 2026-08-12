import { estimateMinutes } from './game-plan.js';

function words(text = '') { return (String(text).match(/[\p{L}\p{N}]+/gu) ?? []).length; }
function splitLong(text, maxWords = 70) {
  const sentences = String(text).match(/[^.!?]+[.!?]+[”"')\]]*|[^.!?]+$/gu) ?? [String(text)];
  const parts = []; let current = '';
  for (const sentence of sentences) {
    const next = `${current} ${sentence}`.trim();
    if (current && words(next) > maxWords) { parts.push(current); current = sentence.trim(); } else current = next;
  }
  if (current) parts.push(current); return parts;
}

function shortCue(text = '') {
  const tokens = String(text).trim().split(/\s+/); return tokens.length > 14 ? `…${tokens.slice(-14).join(' ')}` : String(text).trim();
}

function difficulty(weight) { return weight >= 110 ? 'náročná' : weight >= 55 ? 'stredná' : 'ľahká'; }

function promptFor(entries, entryIndex, character, text, continuation) {
  if (continuation) return { cueSpeaker: 'POKRAČOVANIE', cue: 'Pokračuj bez nového nástupu.', cueFull: '', text };
  for (let i = entryIndex - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry.type === 'speech' && entry.speaker !== character) return { cueSpeaker: entry.speaker, cue: shortCue(entry.text), cueFull: entry.text, text };
  }
  return { cueSpeaker: 'VSTUP', cue: 'Začiatok scény alebo vlastný nástup.', cueFull: '', text };
}

function finalize(unit, order) {
  unit.text = unit.prompts.map(prompt => prompt.text).join('\n'); unit.lineCount = unit.prompts.length;
  unit.words = words(unit.text); unit.minutes = estimateMinutes(unit.text); unit.weight = Math.max(unit.words, unit.minutes * 8);
  unit.difficulty = difficulty(unit.weight); unit.order = order;
  const first = unit.prompts[0]; unit.cueSpeaker = first.cueSpeaker; unit.cue = first.cue; unit.cueFull = first.cueFull; return unit;
}

export function createStudyUnits(scenes, character, makeId) {
  const units = []; let pending = null; let sourceLine = 0;
  const flush = () => { if (pending) { units.push(finalize(pending, units.length)); pending = null; } };
  for (const scene of scenes) {
    flush();
    const entries = scene.entries?.length ? scene.entries : (scene.ownLines ?? []).map((line, sourceIndex) => ({ type: 'speech', speaker: character, text: line.text, sourceIndex }));
    for (const [entryIndex, entry] of entries.entries()) {
      if (entry.type !== 'speech' || entry.speaker !== character) continue;
      sourceLine += 1; const parts = splitLong(entry.text);
      parts.forEach((part, partIndex) => {
        const prompt = promptFor(entries, entryIndex, character, part, partIndex > 0);
        const candidateMinutes = estimateMinutes(part);
        if (candidateMinutes < 10 && pending && pending.sceneTitle === scene.title && estimateMinutes(`${pending.text ?? ''} ${part}`) <= 25) {
          pending.prompts.push(prompt);
        } else {
          flush(); pending = { id: makeId(), sceneTitle: scene.title, section: scene.section, act: scene.section, beat: scene.title, paragraph: entry.sourceIndex ?? entryIndex, line: sourceLine, part: parts.length > 1 ? String.fromCharCode(65 + partIndex) : '', prompts: [prompt], completedAt: null, weak: false };
        }
        pending.text = pending.prompts.map(item => item.text).join('\n');
      });
    }
  }
  flush(); return units;
}

export function splitUnit(units, id, makeId) {
  const index = units.findIndex(unit => unit.id === id); if (index < 0) return units;
  const unit = units[index]; let groups;
  if ((unit.prompts ?? []).length > 1) { const midpoint = Math.ceil(unit.prompts.length / 2); groups = [unit.prompts.slice(0, midpoint), unit.prompts.slice(midpoint)]; }
  else {
    const parts = splitLong(unit.text, 35); if (parts.length < 2) return units;
    groups = parts.map((text, partIndex) => [{ cueSpeaker: partIndex ? 'POKRAČOVANIE' : unit.cueSpeaker, cue: partIndex ? 'Pokračuj bez nového nástupu.' : unit.cue, cueFull: partIndex ? '' : unit.cueFull, text }]);
  }
  const replacements = groups.map((prompts, partIndex) => finalize({ ...unit, id: makeId(), prompts, completedAt: null, part: String.fromCharCode(65 + partIndex) }, Number(unit.order ?? index) + partIndex / groups.length));
  return [...units.slice(0, index), ...replacements, ...units.slice(index + 1)];
}

export function mergeUnitWithNext(units, id) {
  const index = units.findIndex(unit => unit.id === id);
  if (index < 0 || !units[index + 1] || units[index].sceneTitle !== units[index + 1].sceneTitle) return units;
  const first = units[index], second = units[index + 1];
  const merged = finalize({ ...first, prompts: [...(first.prompts ?? [{ cueSpeaker: first.cueSpeaker, cue: first.cue, cueFull: first.cueFull, text: first.text }]), ...(second.prompts ?? [{ cueSpeaker: second.cueSpeaker, cue: second.cue, cueFull: second.cueFull, text: second.text }])], completedAt: null }, first.order);
  return [...units.slice(0, index), merged, ...units.slice(index + 2)];
}
