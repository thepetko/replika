export const TIMER_LEASE_KEY = 'replikaTimerLease';

function cloneActivity(activity) {
  return JSON.parse(JSON.stringify(activity ?? createEmptyActivity()));
}

export function createEmptyActivity() {
  return { days: {} };
}

export function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nextLocalMidnight(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

export function addActivityInterval(activity, startMs, endMs, rehearsalId = null) {
  const next = cloneActivity(activity);
  let cursor = Number(startMs);
  const end = Number(endMs);
  if (!Number.isFinite(cursor) || !Number.isFinite(end) || end <= cursor) return next;

  while (cursor < end) {
    const segmentEnd = Math.min(end, nextLocalMidnight(cursor));
    const seconds = (segmentEnd - cursor) / 1000;
    const key = localDateKey(cursor);
    const day = next.days[key] ?? { totalSeconds: 0, byRehearsal: {} };
    day.totalSeconds = Math.round((day.totalSeconds + seconds) * 1000) / 1000;
    if (rehearsalId) {
      day.byRehearsal[rehearsalId] = Math.round(
        ((day.byRehearsal[rehearsalId] ?? 0) + seconds) * 1000
      ) / 1000;
    }
    next.days[key] = day;
    cursor = segmentEnd;
  }

  return next;
}

function dateAtOffset(now, offset) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
}

export function summarizeActivity(activity, now = new Date()) {
  const source = activity?.days ?? {};
  const days = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const date = dateAtOffset(now, offset);
    const key = localDateKey(date);
    days.push({ key, date, seconds: source[key]?.totalSeconds ?? 0 });
  }

  let last30Seconds = 0;
  for (let offset = -29; offset <= 0; offset += 1) {
    const key = localDateKey(dateAtOffset(now, offset));
    last30Seconds += source[key]?.totalSeconds ?? 0;
  }

  const allTimeSeconds = Object.values(source)
    .reduce((sum, day) => sum + (Number(day.totalSeconds) || 0), 0);

  return {
    todaySeconds: source[localDateKey(now)]?.totalSeconds ?? 0,
    last7Seconds: days.reduce((sum, day) => sum + day.seconds, 0),
    last30Seconds,
    allTimeSeconds,
    days
  };
}

export function acquireTimerLease(storage, tabId, now = Date.now(), leaseMs = 30_000) {
  let current = null;
  try {
    current = JSON.parse(storage?.getItem(TIMER_LEASE_KEY) ?? 'null');
  } catch {
    current = null;
  }

  if (current && current.tabId !== tabId && current.expiresAt > now) return false;

  const lease = { tabId, expiresAt: now + leaseMs };
  storage?.setItem(TIMER_LEASE_KEY, JSON.stringify(lease));
  try {
    return JSON.parse(storage?.getItem(TIMER_LEASE_KEY) ?? 'null')?.tabId === tabId;
  } catch {
    return false;
  }
}

export function releaseTimerLease(storage, tabId) {
  try {
    const current = JSON.parse(storage?.getItem(TIMER_LEASE_KEY) ?? 'null');
    if (current?.tabId === tabId) storage?.removeItem(TIMER_LEASE_KEY);
  } catch {
    storage?.removeItem(TIMER_LEASE_KEY);
  }
}

export class VisibleActivityTracker {
  constructor(options = {}) {
    this.document = options.document ?? globalThis.document;
    this.window = options.window ?? globalThis.window;
    this.storage = options.storage ?? globalThis.localStorage;
    this.onRecord = options.onRecord ?? (() => {});
    this.now = options.now ?? (() => Date.now());
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.setInterval = options.setInterval ?? ((callback, delay) => globalThis.setInterval(callback, delay));
    this.clearInterval = options.clearInterval ?? (timer => globalThis.clearInterval(timer));
    this.intervalMs = options.intervalMs ?? 15_000;
    this.maxGapMs = options.maxGapMs ?? 30_000;
    this.leaseMs = options.leaseMs ?? 30_000;
    this.tabId = options.tabId ?? globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random()}`;
    this.rehearsalId = null;
    this.startedAtWall = null;
    this.startedAtMono = null;
    this.timer = null;
    this.boundVisibility = () => this.handleVisibility();
    this.boundPageHide = () => this.stop();
  }

  start() {
    if (this.timer) return;
    this.document?.addEventListener('visibilitychange', this.boundVisibility);
    this.window?.addEventListener('pagehide', this.boundPageHide);
    this.timer = this.setInterval(() => this.tick(), this.intervalMs);
    this.handleVisibility();
  }

  setRehearsalId(rehearsalId) {
    this.flush();
    this.rehearsalId = rehearsalId ?? null;
    this.beginIfVisible();
  }

  beginIfVisible() {
    if (this.document?.visibilityState !== 'visible') return;
    const wall = this.now();
    if (!acquireTimerLease(this.storage, this.tabId, wall, this.leaseMs)) return;
    this.startedAtWall = wall;
    this.startedAtMono = this.monotonicNow();
  }

  flush() {
    if (this.startedAtWall === null || this.startedAtMono === null) return;
    const endWall = this.now();
    const elapsed = Math.max(0, this.monotonicNow() - this.startedAtMono);
    const counted = Math.min(elapsed, this.maxGapMs);
    if (counted > 0) this.onRecord(endWall - counted, endWall, this.rehearsalId);
    this.startedAtWall = null;
    this.startedAtMono = null;
  }

  tick() {
    if (this.document?.visibilityState !== 'visible') return;
    this.flush();
    this.beginIfVisible();
  }

  handleVisibility() {
    if (this.document?.visibilityState === 'visible') {
      this.beginIfVisible();
    } else {
      this.flush();
      releaseTimerLease(this.storage, this.tabId);
    }
  }

  stop() {
    this.flush();
    releaseTimerLease(this.storage, this.tabId);
    if (this.timer) this.clearInterval(this.timer);
    this.timer = null;
    this.document?.removeEventListener('visibilitychange', this.boundVisibility);
    this.window?.removeEventListener('pagehide', this.boundPageHide);
  }
}
