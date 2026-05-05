// Comparable to AnalysisSim: full analysis service lifecycle.
// Flow: login → GET analysis config → POST /games/from-fen → POST /sessions
//       → navigate → whatif move → revert whatif → start analysis → pause
//       → stop analysis → delete session → delete game → logout.
//
// The whatif and revert steps go beyond AnalysisSim — they exercise endpoints
// that Gatling does not cover and are included here as the k6 suite's
// extended analysis scenario.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { login, logout, bearerAuthHeaders } from '../helpers/auth.js';
import { parseCsv } from '../helpers/csv.js';
import { ANALYSIS_URL } from '../config/env.js';

const users = new SharedArray('users', function () {
  return parseCsv(open('../../src/test/resources/feeders/users.csv'));
});

const fens = new SharedArray('fens', function () {
  return parseCsv(open('../../src/test/resources/feeders/fens.csv'));
});

export const options = {
  scenarios: {
    analysis_lifecycle: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '90s', target: 30 }],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_duration: ['max<5000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const user = users[(__VU - 1) % users.length];
  const fen = fens[__ITER % fens.length];
  const token = login(user.username, user.password);
  if (!token) return;

  const headers = bearerAuthHeaders(token);

  // Fetch engine config to get default bot/line_count (mirrors AnalysisSim)
  const configRes = http.get(`${ANALYSIS_URL}/analysis/config`, {
    headers,
    tags: { name: 'Get analysis config' },
  });
  check(configRes, { 'get config 200': (r) => r.status === 200 });

  let botId = 'blitz';
  let lineCount = 3;
  try {
    const cfg = JSON.parse(configRes.body);
    botId = cfg.default_bot_id || botId;
    lineCount = cfg.default_line_count || lineCount;
  } catch (_) {}

  // Import a game from the FEN feeder
  const importRes = http.post(
    `${ANALYSIS_URL}/games/from-fen`,
    JSON.stringify({ fen: fen.fen }),
    { headers, tags: { name: 'Import game from FEN' } },
  );
  check(importRes, { 'import FEN 201': (r) => r.status === 201 });

  let gameId = null;
  try {
    gameId = JSON.parse(importRes.body).id;
  } catch (_) {}

  if (!gameId) {
    logout();
    return;
  }

  // List and retrieve games to add read-path load
  http.get(`${ANALYSIS_URL}/games`, { headers, tags: { name: 'List games' } });
  http.get(`${ANALYSIS_URL}/games/${gameId}`, { headers, tags: { name: 'Get game by ID' } });

  // Open an analysis session
  const sessionRes = http.post(
    `${ANALYSIS_URL}/sessions`,
    JSON.stringify({ game_id: gameId, bot_id: botId, line_count: lineCount }),
    { headers, tags: { name: 'Create analysis session' } },
  );
  check(sessionRes, { 'create session 201': (r) => r.status === 201 });

  let sessionId = null;
  try {
    sessionId = JSON.parse(sessionRes.body).session_id;
  } catch (_) {}

  if (!sessionId) {
    http.del(`${ANALYSIS_URL}/games/${gameId}`, null, { headers });
    logout();
    return;
  }

  // Navigate to starting position
  const navRes = http.post(
    `${ANALYSIS_URL}/sessions/${sessionId}/navigate`,
    JSON.stringify({ index: 0 }),
    { headers, tags: { name: 'Navigate to position' } },
  );
  check(navRes, { 'navigate 200': (r) => r.status === 200 });

  // Whatif move — exercises the exploration path not covered by AnalysisSim
  const whatifRes = http.post(
    `${ANALYSIS_URL}/sessions/${sessionId}/whatif`,
    JSON.stringify({ move: 'e2e4' }),
    { headers, tags: { name: 'Whatif move' } },
  );
  // 400 is acceptable if the FEN position does not allow e2e4 (e.g. mid-game FEN)
  check(whatifRes, { 'whatif 200 or 400': (r) => r.status === 200 || r.status === 400 });

  if (whatifRes.status === 200) {
    const revertRes = http.del(
      `${ANALYSIS_URL}/sessions/${sessionId}/whatif`,
      null,
      { headers, tags: { name: 'Revert whatif' } },
    );
    check(revertRes, { 'revert whatif 200': (r) => r.status === 200 });
  }

  // Trigger analysis (results come via socket; REST returns immediately)
  const startRes = http.post(
    `${ANALYSIS_URL}/sessions/${sessionId}/analysis`,
    JSON.stringify({}),
    { headers, tags: { name: 'Start analysis' } },
  );
  check(startRes, { 'start analysis 204': (r) => r.status === 204 });

  sleep(Math.random() * 2 + 1); // 1–3 s, simulates user watching results

  const stopRes = http.del(
    `${ANALYSIS_URL}/sessions/${sessionId}/analysis`,
    null,
    { headers, tags: { name: 'Stop analysis' } },
  );
  check(stopRes, { 'stop analysis 204': (r) => r.status === 204 });

  // Cleanup — delete session then game
  http.del(`${ANALYSIS_URL}/sessions/${sessionId}`, null, {
    headers,
    tags: { name: 'Delete session' },
  });
  http.del(`${ANALYSIS_URL}/games/${gameId}`, null, {
    headers,
    tags: { name: 'Delete game' },
  });

  logout();
}
