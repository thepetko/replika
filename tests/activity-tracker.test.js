import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acquireTimerLease,
  addActivityInterval,
  createEmptyActivity,
  summarizeActivity,
  VisibleActivityTracker
} from '../src/activity-tracker.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

test('interval sa započíta celkovo aj ku konkrétnej replike', () => {
  const activity = createEmptyActivity();
  const start = new Date(2026, 6, 8, 10, 0, 0).getTime();
  const end = start + 90_000;

  const next = addActivityInterval(activity, start, end, 'r1');
  const day = next.days['2026-07-08'];

  assert.equal(day.totalSeconds, 90);
  assert.equal(day.byRehearsal.r1, 90);
});

test('interval cez polnoc sa rozdelí do dvoch miestnych dní', () => {
  const start = new Date(2026, 6, 8, 23, 59, 30).getTime();
  const end = new Date(2026, 6, 9, 0, 0, 30).getTime();
  const next = addActivityInterval(createEmptyActivity(), start, end, null);

  assert.equal(next.days['2026-07-08'].totalSeconds, 30);
  assert.equal(next.days['2026-07-09'].totalSeconds, 30);
});

test('heartbeat neumožní druhej karte prevziať živý prenájom', () => {
  const storage = memoryStorage();

  assert.equal(acquireTimerLease(storage, 'tab-a', 1_000, 30_000), true);
  assert.equal(acquireTimerLease(storage, 'tab-b', 2_000, 30_000), false);
  assert.equal(acquireTimerLease(storage, 'tab-b', 32_000, 30_000), true);
});

test('súhrn vráti dnešok, 7 dní, 30 dní a celok', () => {
  let activity = createEmptyActivity();
  const now = new Date(2026, 6, 8, 12, 0, 0);
  activity.days['2026-07-08'] = { totalSeconds: 600, byRehearsal: { r1: 300 } };
  activity.days['2026-07-07'] = { totalSeconds: 120, byRehearsal: {} };
  activity.days['2026-06-01'] = { totalSeconds: 30, byRehearsal: {} };

  const summary = summarizeActivity(activity, now);

  assert.equal(summary.todaySeconds, 600);
  assert.equal(summary.last7Seconds, 720);
  assert.equal(summary.last30Seconds, 720);
  assert.equal(summary.allTimeSeconds, 750);
  assert.equal(summary.days.length, 7);
});

test('tracker nezapočíta celé dlhé oneskorenie po uspatí zariadenia', () => {
  const storage = memoryStorage();
  const document = {
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {}
  };
  const window = { addEventListener() {}, removeEventListener() {} };
  let wall = 1_000;
  let monotonic = 0;
  const recorded = [];
  const tracker = new VisibleActivityTracker({
    storage,
    document,
    window,
    now: () => wall,
    monotonicNow: () => monotonic,
    setInterval: () => 1,
    clearInterval() {},
    maxGapMs: 30_000,
    tabId: 'tab-a',
    onRecord: (start, end) => recorded.push(end - start)
  });

  tracker.start();
  wall += 60 * 60 * 1000;
  monotonic += 60 * 60 * 1000;
  tracker.flush();
  tracker.stop();

  assert.deepEqual(recorded, [30_000]);
});

test('skrytie aplikácie okamžite uzavrie viditeľný interval', () => {
  const storage = memoryStorage();
  const document = {
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {}
  };
  const window = { addEventListener() {}, removeEventListener() {} };
  let wall = 10_000;
  let monotonic = 5_000;
  const recorded = [];
  const tracker = new VisibleActivityTracker({
    storage,
    document,
    window,
    now: () => wall,
    monotonicNow: () => monotonic,
    setInterval: () => 1,
    clearInterval() {},
    tabId: 'tab-a',
    onRecord: (start, end) => recorded.push(end - start)
  });

  tracker.start();
  wall += 12_000;
  monotonic += 12_000;
  document.visibilityState = 'hidden';
  tracker.handleVisibility();
  tracker.stop();

  assert.deepEqual(recorded, [12_000]);
});
