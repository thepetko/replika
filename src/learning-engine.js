const RATINGS = new Set(['bad', 'almost', 'good']);
const MAX_HISTORY = 50;

function copyState(state) {
  return { ...state };
}

function copySession(session) {
  return {
    sentences: [...session.sentences],
    blocks: session.blocks.map(block => ({ ...block })),
    state: copyState(session.state),
    kind: session.kind ?? 'learning',
    status: session.status,
    history: session.history.map(entry => ({
      state: copyState(entry.state),
      status: entry.status
    }))
  };
}

function initialState() {
  return {
    phase: 'learn',
    current: 0,
    knownEnd: -1,
    segmentStart: 0,
    segmentEnd: 0,
    display: 'study',
    hintLevel: 0,
    usedHint: false,
    retries: 0,
    lastRating: null,
    lastEffectiveRating: null,
    lastAttemptAssisted: false
  };
}

function currentBlockFor(session, index) {
  return session.blocks.find(block => index >= block.start && index <= block.end)
    ?? { start: 0, end: session.sentences.length - 1 };
}

function remember(session) {
  const next = copySession(session);
  next.history.push({ state: copyState(session.state), status: session.status });
  next.history = next.history.slice(-MAX_HISTORY);
  return next;
}

function resetPresentation(state) {
  state.display = 'study';
  state.hintLevel = 0;
  state.usedHint = false;
}

function startWholeRehearsal(session) {
  session.state.phase = 'all';
  session.state.current = session.sentences.length - 1;
  session.state.segmentStart = 0;
  session.state.segmentEnd = session.sentences.length - 1;
}

function advanceToNextSentence(session) {
  const next = Math.max(session.state.current + 1, session.state.knownEnd + 1);
  if (next >= session.sentences.length) {
    startWholeRehearsal(session);
    return;
  }

  session.state.phase = 'learn';
  session.state.current = next;
  session.state.segmentStart = next;
  session.state.segmentEnd = next;
  session.state.retries = 0;
}

function handleLearnRating(session, rating) {
  const state = session.state;

  if (rating === 'good') {
    state.knownEnd = Math.max(state.knownEnd, state.current);
    state.retries = 0;

    if (session.sentences.length === 1) {
      startWholeRehearsal(session);
      return;
    }

    const block = currentBlockFor(session, state.current);
    const learnedInBlock = state.current - block.start + 1;

    if (state.current === block.end || learnedInBlock >= 3) {
      state.phase = 'block';
      state.segmentStart = block.start;
      state.segmentEnd = state.current;
    } else if (state.current > 0) {
      state.phase = 'bridge';
      state.segmentStart = state.current - 1;
      state.segmentEnd = state.current;
    } else {
      advanceToNextSentence(session);
    }
    return;
  }

  state.retries += 1;
  if (state.current > 0) {
    state.phase = 'bridge';
    state.segmentStart = state.current - 1;
    state.segmentEnd = state.current;
  }
}

function advanceAfterBridge(session) {
  const state = session.state;
  const block = currentBlockFor(session, state.segmentEnd);
  const learnedInBlock = state.segmentEnd - block.start + 1;

  if (state.segmentEnd === block.end || learnedInBlock >= 3) {
    state.phase = 'block';
    state.segmentStart = block.start;
  } else {
    advanceToNextSentence(session);
  }
}

function handleSequenceRating(session, rating) {
  const state = session.state;

  if (rating === 'good') {
    if (state.phase === 'all') {
      session.status = 'done';
      return;
    }

    state.knownEnd = Math.max(state.knownEnd, state.segmentEnd);
    if (state.phase === 'bridge') {
      advanceAfterBridge(session);
    } else {
      if (state.segmentEnd === session.sentences.length - 1) {
        startWholeRehearsal(session);
      } else {
        advanceToNextSentence(session);
      }
    }
    return;
  }

  state.retries += 1;
  if (rating === 'almost') {
    if (state.phase === 'block' && state.segmentEnd - state.segmentStart >= 2) {
      state.segmentStart += 1;
    }
    return;
  }
  // Pri chybe v dlhšom úseku nepoznáme jej presné miesto.
  // Zachováme preto celý pôvodný kontext namiesto falošnej lokalizácie.
}

export function createSession(parsedText) {
  const sentences = [...(parsedText?.sentences ?? [])];
  const blocks = (parsedText?.blocks ?? []).map(block => ({ ...block }));

  if (!sentences.length) {
    throw new Error('Relácia vyžaduje aspoň jednu vetu.');
  }

  return {
    sentences,
    blocks: blocks.length ? blocks : [{ start: 0, end: sentences.length - 1 }],
    state: initialState(),
    kind: 'learning',
    status: 'active',
    history: []
  };
}

export function createReviewSession(parsedText) {
  const session = createSession(parsedText);
  session.kind = 'review';
  session.state.phase = 'all';
  session.state.current = session.sentences.length - 1;
  session.state.knownEnd = session.sentences.length - 1;
  session.state.segmentStart = 0;
  session.state.segmentEnd = session.sentences.length - 1;
  session.state.display = 'recall';
  return session;
}

export function getCurrentTask(session) {
  if (session.status === 'done') return null;

  const state = session.state;
  const start = state.phase === 'learn' ? state.current : state.segmentStart;
  const end = state.phase === 'learn' ? state.current : state.segmentEnd;

  return {
    phase: state.phase,
    range: { start, end },
    text: session.sentences.slice(start, end + 1).join(' '),
    display: state.display,
    hintLevel: state.hintLevel,
    usedHint: state.usedHint,
    knownEnd: state.knownEnd,
    retries: state.retries,
    lastRating: state.lastRating
  };
}

export function advancePresentation(session) {
  if (session.status === 'done' || session.state.display === 'rate') return session;

  const next = remember(session);
  next.state.display = next.state.display === 'study' ? 'recall' : 'rate';
  if (next.state.display === 'recall') next.state.hintLevel = 0;
  return next;
}

export function giveHint(session) {
  if (session.status === 'done' || session.state.display !== 'recall') return session;

  const next = copySession(session);
  next.state.hintLevel = Math.min(2, next.state.hintLevel + 1);
  next.state.usedHint = true;
  return next;
}

export function rateCurrentTask(session, rating) {
  if (!RATINGS.has(rating)) {
    throw new Error(`Neplatné hodnotenie: ${rating}`);
  }
  if (session.status === 'done') return session;

  const next = remember(session);
  const assisted = next.state.usedHint;
  const effectiveRating = rating === 'good' && assisted ? 'almost' : rating;
  next.state.lastRating = rating;
  next.state.lastEffectiveRating = effectiveRating;
  next.state.lastAttemptAssisted = assisted;
  resetPresentation(next.state);

  if (next.state.phase === 'learn') {
    handleLearnRating(next, effectiveRating);
  } else {
    handleSequenceRating(next, effectiveRating);
  }

  return next;
}

export function goBack(session) {
  if (!session.history.length) return session;

  const next = copySession(session);
  const previous = next.history.pop();
  next.state = previous.state;
  next.status = previous.status;
  return next;
}

export function repeatCurrentTask(session) {
  if (session.status === 'done') return session;

  const next = remember(session);
  if (next.state.phase === 'learn') {
    const block = currentBlockFor(next, next.state.current);
    next.state.phase = 'block';
    next.state.segmentStart = block.start;
    next.state.segmentEnd = next.state.current;
  }
  resetPresentation(next.state);
  return next;
}

export function restartSession(session) {
  return {
    sentences: [...session.sentences],
    blocks: session.blocks.map(block => ({ ...block })),
    state: initialState(),
    kind: 'learning',
    status: 'active',
    history: []
  };
}
