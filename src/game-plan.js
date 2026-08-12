export const DEFAULT_PLAN_CONFIG = Object.freeze({ reviewGaps: [1, 3, 7], overloadThreshold: 270, weakLinePenalty: 16 });

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); }
export function addPlanDays(key, days) { const d = dateFromKey(key); d.setDate(d.getDate() + days); return localDateKey(d); }

export function availableDates(start, deadline, daysOff = []) {
  if (!start || !deadline || start > deadline) return [];
  const off = new Set(daysOff); const dates = [];
  for (let day = start; day <= deadline; day = addPlanDays(day, 1)) if (!off.has(day)) dates.push(day);
  return dates;
}

export function estimateMinutes(text = '') {
  const words = (String(text).match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const sentences = (String(text).match(/[.!?]+/gu) ?? []).length;
  const interruptions = (String(text).match(/(?:—|–|\.\.\.)/gu) ?? []).length;
  return Math.max(4, Math.min(30, Math.round(words / 7 + sentences * 1.5 + interruptions * 1.5)));
}

export function unitWeight(unit, weakPenalty = DEFAULT_PLAN_CONFIG.weakLinePenalty) {
  const words = Number(unit.words) || (String(unit.text).match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const base = Number(unit.weight) || Math.max(words, Number(unit.minutes || 0) * 8);
  return base + (unit.weak ? weakPenalty : 0);
}

function chronological(units) {
  return units.map((unit, index) => ({ unit, index }))
    .sort((a, b) => (Number(a.unit.order ?? a.index) - Number(b.unit.order ?? b.index)) || a.index - b.index)
    .map(({ unit }) => unit);
}

function distribute(units, dates, weakPenalty) {
  const result = Object.fromEntries(dates.map(date => [date, []])); const queue = [...units];
  dates.forEach((date, dayIndex) => {
    if (!queue.length) return;
    const target = queue.reduce((sum, unit) => sum + unitWeight(unit, weakPenalty), 0) / (dates.length - dayIndex);
    let load = 0;
    while (queue.length) {
      const next = unitWeight(queue[0], weakPenalty);
      if (result[date].length && load + next > target && Math.abs(target - load) <= Math.abs(target - load - next)) break;
      result[date].push(queue.shift()); load += next;
      if (load >= target) break;
    }
  });
  if (queue.length && dates.length) result[dates.at(-1)].push(...queue);
  return result;
}

function completionDay(unit) { return unit.completedAt ? localDateKey(unit.completedAt) : null; }

export function reviewUnitsForDate(units, date, gaps = DEFAULT_PLAN_CONFIG.reviewGaps) {
  const due = new Set(gaps.map(gap => addPlanDays(date, -gap)));
  return chronological(units).filter(unit => due.has(completionDay(unit)));
}

export function buildSchedule(units, options = {}) {
  const start = options.start ?? localDateKey();
  const calendarStart = options.calendarStart ?? start;
  const deadline = options.deadline;
  const newMaterialEnd = options.newMaterialEnd && options.newMaterialEnd <= deadline ? options.newMaterialEnd : deadline;
  const daysOff = options.daysOff ?? [];
  const lockedPlans = options.lockedPlans ?? {};
  const reviewGaps = options.reviewGaps ?? DEFAULT_PLAN_CONFIG.reviewGaps;
  const weakPenalty = options.weakLinePenalty ?? DEFAULT_PLAN_CONFIG.weakLinePenalty;
  const overload = options.overloadThreshold ?? DEFAULT_PLAN_CONFIG.overloadThreshold;
  const allDates = deadline ? availableDates(calendarStart, deadline, []) : [];
  const activeDates = availableDates(start, deadline, daysOff);
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const lockedTodayIds = new Set(lockedPlans[start] ?? []);
  const lockedToday = [...lockedTodayIds].map(id => byId.get(id)).filter(unit => unit && !unit.completedAt);
  const remaining = chronological(units).filter(unit => !unit.completedAt && !lockedTodayIds.has(unit.id));
  const protectedDates = activeDates.filter(date => date > newMaterialEnd);
  let learningDates = activeDates.filter(date => date >= start && date <= newMaterialEnd);
  if (lockedPlans[start]) learningDates = learningDates.filter(date => date !== start);
  const remainingWeight = remaining.reduce((sum, unit) => sum + unitWeight(unit, weakPenalty), 0);
  for (const date of protectedDates) if (!learningDates.length || remainingWeight / learningDates.length > overload || start > newMaterialEnd) learningDates.push(date);
  const schedule = Object.fromEntries(allDates.map(date => [date, []]));
  for (const [date, ids] of Object.entries(lockedPlans)) if (date < start && schedule[date]) schedule[date] = ids.map(id => byId.get(id)).filter(Boolean);
  if (schedule[start]) schedule[start] = lockedToday;
  const dynamic = distribute(remaining, learningDates, weakPenalty);
  for (const [date, planned] of Object.entries(dynamic)) schedule[date] = planned;
  const reviews = Object.fromEntries(allDates.map(date => [date, daysOff.includes(date) ? [] : reviewUnitsForDate(units, date, reviewGaps)]));
  const totalMinutes = remaining.reduce((sum, unit) => sum + Number(unit.minutes || 0), 0) + lockedToday.reduce((sum, unit) => sum + Number(unit.minutes || 0), 0);
  const usable = learningDates.length + (lockedToday.length ? 1 : 0);
  return { schedule, reviews, dates: activeDates, allDates, totalMinutes, totalWeight: remainingWeight, requiredDailyMinutes: usable ? Math.ceil(totalMinutes / usable) : totalMinutes, impossible: Boolean((remaining.length || lockedToday.length) && !usable), usedReviewDays: learningDates.some(date => date > newMaterialEnd) };
}
