// Talks to start.ng through its hidden connect page.
// Players, scores and the leaderboard all come from start.ng.
// The connect page only answers games served from a *.start.ng address,
// so every call resolves to null when the game is opened locally.

const START_NG = 'https://start.ng';
let frame;

function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frame;
}

// Sends a message and resolves to start.ng's reply, or null if it did not answer.
// The timer starts straight away, so a frame that never loads cannot hang the game.
export function askStartNg(message, replyType, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    let settled = false;
    let el = null;
    const finish = (reply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    function onMessage(e) {
      // Always check the origin: this is what makes the reply trustworthy.
      if (!el || e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) finish(e.data);
    }
    addEventListener('message', onMessage);
    connectFrame()
      .then((frameEl) => {
        el = frameEl;
        if (!settled) el.contentWindow.postMessage({ ...message, requestId }, START_NG);
      })
      .catch(() => finish(null));
  });
}

// Who is playing: { user, guest }. user is null for a guest.
export async function whoami() {
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  if (!reply) return null;
  return { user: reply.user ?? null, guest: reply.guest ?? null };
}

// Saves a run. Resolves to { ok, result } or { ok: false, error }.
export async function saveRun(coins) {
  const whole = Math.max(0, Math.min(1_000_000_000, Math.floor(coins)));
  const reply = await askStartNg(
    { type: 'startng:score', stats: { coins: whole } },
    'startng:scoreSaved',
    6000,
  );
  return reply ?? { ok: false, error: 'start.ng did not answer' };
}

// Reads the top players. Resolves to an array of entries (empty on failure).
export async function readBoard(limit = 5) {
  const reply = await askStartNg(
    { type: 'startng:leaderboard', limit },
    'startng:leaderboardData',
    6000,
  );
  return reply?.ok && Array.isArray(reply.entries) ? reply.entries : [];
}

// The link that sends a player to start.ng to sign in and come back here.
export function signInUrl() {
  return `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}
