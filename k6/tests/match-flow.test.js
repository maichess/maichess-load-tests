// Comparable to MatchFlowSim: match state read, legal moves, conditional move
// submission, and resignation.
//
// PREREQUISITE: matches.csv must be populated with username, password, and
// match_id rows before running this test. Match IDs are not obtainable via
// REST alone (they are delivered by the socket service after matchmaking), so
// they must be seeded out-of-band. This mirrors the same constraint in
// MatchFlowSim. The test exits gracefully if the file contains no data rows.
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { login, logout, bearerAuthHeaders } from '../helpers/auth.js';
import { parseCsv } from '../helpers/csv.js';
import { MATCHMANAGER_URL } from '../config/env.js';

const matches = new SharedArray('matches', function () {
  return parseCsv(open('../../src/test/resources/feeders/matches.csv'));
});

export const options = {
  scenarios: {
    match_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '30s', target: 10 }],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['max<5000'],
    // 5% tolerance matches MatchFlowSim — 403/409 are expected for concurrent
    // bots or already-ended matches and are not counted as failures below.
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  if (matches.length === 0) {
    console.warn(
      'matches.csv has no data rows — populate username,password,match_id before running this test',
    );
    return;
  }

  const match = matches[(__VU - 1) % matches.length];
  const token = login(match.username, match.password);
  if (!token) return;

  const headers = bearerAuthHeaders(token);
  const matchId = match.match_id;

  const stateRes = http.get(`${MATCHMANAGER_URL}/matches/${matchId}`, {
    headers,
    tags: { name: 'Get match state' },
  });
  check(stateRes, { 'get match state 200': (r) => r.status === 200 });

  let matchStatus = 'unknown';
  try {
    matchStatus = JSON.parse(stateRes.body).status;
  } catch (_) {}

  const movesRes = http.get(`${MATCHMANAGER_URL}/matches/${matchId}/legal-moves`, {
    headers,
    tags: { name: 'Get legal moves' },
  });
  check(movesRes, { 'legal moves 200': (r) => r.status === 200 });

  let firstMove = null;
  try {
    const moves = JSON.parse(movesRes.body).moves;
    if (moves && moves.length > 0) firstMove = moves[0];
  } catch (_) {}

  if (matchStatus === 'ongoing' && firstMove) {
    const moveRes = http.post(
      `${MATCHMANAGER_URL}/matches/${matchId}/moves`,
      JSON.stringify({ move: firstMove }),
      { headers, tags: { name: 'Submit move' } },
    );
    // 403 = not your turn / not a participant, 409 = match ended — both acceptable
    check(moveRes, {
      'submit move 200 or 403 or 409': (r) =>
        r.status === 200 || r.status === 403 || r.status === 409,
    });
  }

  const resignRes = http.post(
    `${MATCHMANAGER_URL}/matches/${matchId}/resign`,
    null,
    { headers, tags: { name: 'Resign' } },
  );
  check(resignRes, { 'resign 200 or 409': (r) => r.status === 200 || r.status === 409 });

  logout();
}
