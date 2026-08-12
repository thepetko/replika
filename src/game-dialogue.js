function normalizedText(text = '') { return String(text).toLocaleLowerCase('sk').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }

function unitMatchKey(unit) {
  return [unit.section, unit.sceneTitle, unit.text].map(normalizedText).join('|');
}

export function mergeStudyUnitProgress(existingUnits = [], freshUnits = []) {
  const exact = new Map(); const byText = new Map(); const used = new Set();
  for (const unit of existingUnits) {
    const add = (map, key) => map.set(key, [...(map.get(key) ?? []), unit]);
    add(exact, unitMatchKey(unit)); add(byText, normalizedText(unit.text));
  }
  const take = (queue = []) => queue.find(unit => !used.has(unit));
  return freshUnits.map(fresh => {
    const previous = take(exact.get(unitMatchKey(fresh))) ?? take(byText.get(normalizedText(fresh.text)));
    if (!previous) return fresh;
    used.add(previous);
    return {
      ...fresh,
      id: previous.id,
      completedAt: previous.completedAt ?? null,
      weak: Boolean(previous.weak)
    };
  });
}

export function setStudyUnitCompletion(games, gameId, unitId, completedAt, plan = {}) {
  const game = games.find(item => item.id === gameId);
  const unit = game?.units?.find(item => item.id === unitId);
  if (!unit) return false;
  if (completedAt && plan.date && plan.unitIds?.length) {
    game.lockedPlans ??= {};
    if (!Object.hasOwn(game.lockedPlans, plan.date)) {
      const validIds = new Set(game.units.map(item => item.id));
      game.lockedPlans[plan.date] = [...new Set(plan.unitIds)].filter(id => validIds.has(id));
    }
  }
  unit.completedAt = completedAt;
  return true;
}

function scenePrompts(scene, character) {
  const entries = scene.entries ?? []; const prompts = [];
  for (const [index, entry] of entries.entries()) {
    if (entry.type !== 'speech' || entry.speaker !== character) continue;
    let cue = null;
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      if (entries[previous].type !== 'speech') continue;
      cue = entries[previous].speaker === character
        ? { cueSpeaker: 'POKRAČOVANIE', cue: 'Pokračuj bez nového nástupu.', cueFull: '' }
        : { cueSpeaker: entries[previous].speaker, cue: entries[previous].text, cueFull: entries[previous].text };
      break;
    }
    prompts.push({ sourceText: entry.text, ...(cue ?? { cueSpeaker: 'VSTUP', cue: 'Začiatok scény alebo vlastný nástup.', cueFull: '' }) });
  }
  return prompts;
}

export function enrichStudyUnitPrompts(units, scenes, character) {
  const sources = new Map(scenes.map(scene => [scene.title, scenePrompts(scene, character)]));
  const cursors = new Map(); const lastMatches = new Map(); let changed = false;
  for (const unit of [...units].sort((a, b) => Number(a.order) - Number(b.order))) {
    if (unit.dialogueReady || unit.prompts?.some(prompt => !prompt.cueMissing && (prompt.cueFull || !['VSTUP', 'POKRAČOVANIE'].includes(prompt.cueSpeaker)))) continue;
    const available = sources.get(unit.sceneTitle); if (!available?.length) continue;
    const parts = String(unit.text).split(/\n+/).map(text => text.trim()).filter(Boolean); const resolved = [];
    let cursor = cursors.get(unit.sceneTitle) ?? 0;
    for (const part of parts) {
      const target = normalizedText(part); let match = -1;
      for (let index = Math.max(0, cursor - 1); index < available.length; index += 1) {
        const source = normalizedText(available[index].sourceText);
        if (source.includes(target) || target.includes(source)) { match = index; break; }
      }
      if (match < 0) continue;
      const source = available[match]; const continuation = lastMatches.get(unit.sceneTitle) === match;
      resolved.push({ cueSpeaker: continuation ? 'POKRAČOVANIE' : source.cueSpeaker, cue: continuation ? 'Pokračuj bez nového nástupu.' : source.cue, cueFull: continuation ? '' : source.cueFull, text: part });
      lastMatches.set(unit.sceneTitle, match);
      const fullSource = normalizedText(source.sourceText);
      cursor = target === fullSource || target.includes(fullSource) ? match + 1 : match;
    }
    if (resolved.length) {
      unit.prompts = resolved; unit.cueSpeaker = resolved[0].cueSpeaker; unit.cue = resolved[0].cue; unit.cueFull = resolved[0].cueFull; unit.dialogueReady = true; cursors.set(unit.sceneTitle, cursor); changed = true;
    }
  }
  return changed;
}
