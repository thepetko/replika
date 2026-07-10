const RATINGS = new Set(['bad', 'almost', 'good']);
const MAX_HISTORY = 50;
const CHECKPOINT_INTERVAL = 2;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function remember(session) {
  const next = clone(session);
  next.history.push({ state: clone(session.state), status: session.status });
  next.history = next.history.slice(-MAX_HISTORY);
  return next;
}
function ownIndices(session) {
  return session.entries.map((entry, index) => entry.type === 'speech' && entry.speaker === session.character ? index : -1).filter(index => index >= 0);
}
function resetPresentation(state) {
  state.display = 'study'; state.hintLevel = 0; state.usedHint = false;
}
function nextOwnAfter(session, index) { return ownIndices(session).find(candidate => candidate > index) ?? null; }
function startAll(session) {
  session.state.phase = 'all';
  session.state.targetIndex = null;
  session.state.scopeEnd = session.entries.length - 1;
  session.state.newSinceCheckpoint = 0;
}

export function createSceneSession(parsed, character) {
  const entries = clone(parsed.entries ?? []);
  const first = entries.findIndex(entry => entry.type === 'speech' && entry.speaker === character);
  if (first < 0) throw new Error('Vybraná postava nemá v scéne repliku.');
  return {
    entries, character, kind: 'learning', status: 'active', history: [],
    state: { phase: 'learn', targetIndex: first, scopeEnd: first, learnedIndices: [], newSinceCheckpoint: 0, display: 'study', hintLevel: 0, usedHint: false, lastRating: null, lastAttemptAssisted: false }
  };
}

export function createSceneReviewSession(parsed, character) {
  const session = createSceneSession(parsed, character);
  session.kind = 'review';
  session.state.learnedIndices = ownIndices(session);
  startAll(session);
  session.state.display = 'recall';
  return session;
}

export function getCurrentSceneTask(session) {
  if (session.status === 'done') return null;
  const state = session.state;
  const scopeEnd = state.phase === 'learn' ? state.targetIndex : state.scopeEnd;
  return { phase: state.phase, targetIndex: state.targetIndex, scopeEnd, display: state.display, hintLevel: state.hintLevel, usedHint: state.usedHint, learnedIndices: [...state.learnedIndices], character: session.character, totalOwn: ownIndices(session).length };
}

export function advanceScenePresentation(session) {
  if (session.status === 'done' || session.state.display === 'rate') return session;
  const next = remember(session);
  next.state.display = next.state.display === 'study' ? 'recall' : 'rate';
  if (next.state.display === 'recall') next.state.hintLevel = 0;
  return next;
}

export function giveSceneHint(session) {
  if (session.status === 'done' || session.state.display !== 'recall') return session;
  const next = clone(session);
  next.state.hintLevel = Math.min(2, next.state.hintLevel + 1);
  next.state.usedHint = true;
  return next;
}

export function rateSceneTask(session, rating) {
  if (!RATINGS.has(rating)) throw new Error(`Neplatné hodnotenie: ${rating}`);
  if (session.status === 'done') return session;
  const next = remember(session);
  const effective = rating === 'good' && next.state.usedHint ? 'almost' : rating;
  next.state.lastRating = rating;
  next.state.lastAttemptAssisted = next.state.usedHint;
  resetPresentation(next.state);
  if (effective !== 'good') return next;

  if (next.state.phase === 'learn') {
    const target = next.state.targetIndex;
    if (!next.state.learnedIndices.includes(target)) next.state.learnedIndices.push(target);
    next.state.newSinceCheckpoint += 1;
    next.state.scopeEnd = target;
    const following = nextOwnAfter(next, target);
    if (!following) { startAll(next); return next; }
    if (next.state.newSinceCheckpoint >= CHECKPOINT_INTERVAL) {
      next.state.phase = 'checkpoint';
      next.state.targetIndex = null;
      return next;
    }
    next.state.targetIndex = following;
    return next;
  }
  if (next.state.phase === 'checkpoint') {
    const following = nextOwnAfter(next, next.state.scopeEnd);
    next.state.newSinceCheckpoint = 0;
    if (!following) startAll(next);
    else { next.state.phase = 'learn'; next.state.targetIndex = following; }
    return next;
  }
  next.status = 'done';
  return next;
}

export function goBackScene(session) {
  if (!session.history.length) return session;
  const next = clone(session); const previous = next.history.pop(); next.state = previous.state; next.status = previous.status; return next;
}
export function repeatSceneTask(session) {
  if (session.status === 'done') return session;
  const next = remember(session); resetPresentation(next.state); return next;
}
