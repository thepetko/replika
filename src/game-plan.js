const DAY = 86_400_000;

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(key, days) { const d = dateFromKey(key); d.setDate(d.getDate() + days); return localDateKey(d); }

export function availableDates(start, deadline, daysOff = []) {
  if (!start || !deadline || start > deadline) return [];
  const off = new Set(daysOff);
  const dates = [];
  for (let day = start; day <= deadline; day = addDays(day, 1)) if (!off.has(day)) dates.push(day);
  return dates;
}

export function estimateMinutes(text = '') {
  const words = (String(text).match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const sentences = (String(text).match(/[.!?]+/gu) ?? []).length;
  const interruptions = (String(text).match(/(?:—|–|\.\.\.)/gu) ?? []).length;
  return Math.max(4, Math.min(30, Math.round(words / 7 + sentences * 1.5 + interruptions * 1.5)));
}

export function buildSchedule(units, { start = localDateKey(), deadline, daysOff = [] } = {}) {
  const remaining = units.filter(unit => !unit.completedAt);
  const dates = availableDates(start, deadline, daysOff);
  const schedule = Object.fromEntries(dates.map(date => [date, []]));
  const totalMinutes = remaining.reduce((sum, unit) => sum + Number(unit.minutes || 0), 0);
  if (!remaining.length || !dates.length) return { schedule, dates, totalMinutes, requiredDailyMinutes: dates.length ? Math.ceil(totalMinutes / dates.length) : totalMinutes, impossible: Boolean(remaining.length && !dates.length) };
  const target = totalMinutes / dates.length;
  let index = 0;
  let load = 0;
  for (const unit of remaining) {
    if (index < dates.length - 1 && load && load + unit.minutes > target * 1.35) { index += 1; load = 0; }
    schedule[dates[index]].push(unit);
    load += unit.minutes;
    if (index < dates.length - 1 && load >= target * .9) { index += 1; load = 0; }
  }
  return { schedule, dates, totalMinutes, requiredDailyMinutes: Math.ceil(totalMinutes / dates.length), impossible: false };
}
