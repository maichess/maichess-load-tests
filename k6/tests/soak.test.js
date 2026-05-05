// NEW — Soak test: sustained moderate load over an extended period.
// Purpose: surface memory leaks, connection pool exhaustion, session
// accumulation, and performance degradation that only appear over time.
//
// The scenario deliberately creates and destroys analysis sessions each
// iteration — if the analysis service leaks sessions, throughput will
// degrade visibly in the k6 output over the soak window.
//
// Default duration: 30 minutes. Override with: --env SOAK_DURATION=10m
// Thresholds use p95 (not max) because isolated latency spikes are
// expected and should not mask a clean soak run.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { login, logout, bearerAuthHeaders, cookieAuthHeaders } from '../helpers/auth.js';
import { parseCsv } from '../helpers/csv.js';
import { USER_URL, ANALYSIS_URL } from '../config/env.js';

const users = new SharedArray('users', function () {
  return parseCsv(open('../../src/test/resources/feeders/users.csv'));
});

const fens = new SharedArray('fens', function () {
  return parseCsv(open('../../src/test/resources/feeders/fens.csv'));
});

const soakDuration = __ENV.SOAK_DURATION || '30m';

export const options = {
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },      // warm-up ramp
        { duration: soakDuration, target: 20 }, // sustained load
        { duration: '2m', target: 0 },        // cool-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Stricter percentile-based thresholds — a rising p95 over the soak
    // window is the primary signal of degradation.
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const user = users[(__VU - 1) % users.length];
  const fen = fens[__ITER % fens.length];
  const token = login(user.username, user.password);
  if (!token) return;

  // Profile check — validates the user service is not leaking auth state
  http.get(`${USER_URL}/users/me`, {
    headers: cookieAuthHeaders(token),
    tags: { name: 'Profile check (soak)' },
  });

  const analysisHeaders = bearerAuthHeaders(token);

  // Create a game, open a session, then clean up — any leak is observable
  const importRes = http.post(
    `${ANALYSIS_URL}/games/from-fen`,
    JSON.stringify({ fen: fen.fen }),
    { headers: analysisHeaders, tags: { name: 'Import FEN (soak)' } },
  );
  check(importRes, { 'import 201': (r) => r.status === 201 });

  let gameId = null;
  try {
    gameId = JSON.parse(importRes.body).id;
  } catch (_) {}

  if (gameId) {
    const sessionRes = http.post(
      `${ANALYSIS_URL}/sessions`,
      JSON.stringify({ game_id: gameId, bot_id: 'blitz', line_count: 2 }),
      { headers: analysisHeaders, tags: { name: 'Open session (soak)' } },
    );
    check(sessionRes, { 'session 201': (r) => r.status === 201 });

    let sessionId = null;
    try {
      sessionId = JSON.parse(sessionRes.body).session_id;
    } catch (_) {}

    sleep(1); // brief pause to simulate light usage

    if (sessionId) {
      http.del(`${ANALYSIS_URL}/sessions/${sessionId}`, null, { headers: analysisHeaders });
    }
    http.del(`${ANALYSIS_URL}/games/${gameId}`, null, { headers: analysisHeaders });
  }

  logout();
}
