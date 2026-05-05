// Comparable to MatchMakerSim: matchmaking queue enter and leave.
// Flow: login → GET /bots → POST /queue (bot match) → DELETE /queue → logout.
// Includes a per-request p99 threshold on queue entry, mirroring the
// details("Enter queue").responseTime.percentile(99) < 1500 assertion in
// MatchMakerSim — the most precise assertion in the Gatling suite.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { login, logout, bearerAuthHeaders } from '../helpers/auth.js';
import { parseCsv } from '../helpers/csv.js';
import { MATCHMAKER_URL } from '../config/env.js';

const users = new SharedArray('users', function () {
  return parseCsv(open('../../src/test/resources/feeders/users.csv'));
});

export const options = {
  scenarios: {
    matchmaking_queue: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '60s', target: 40 }],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['max<3000'],
    http_req_failed: ['rate<0.01'],
    // Per-request p99 on queue entry — mirrors MatchMakerSim's granular assertion.
    'http_req_duration{name:Enter queue}': ['p(99)<1500'],
  },
};

export default function () {
  const user = users[(__VU - 1) % users.length];
  const token = login(user.username, user.password);
  if (!token) return;

  const headers = bearerAuthHeaders(token);

  const botsRes = http.get(`${MATCHMAKER_URL}/bots`, {
    headers,
    tags: { name: 'List bots' },
  });
  check(botsRes, { 'list bots 200': (r) => r.status === 200 });

  let botId = 'bullet';
  try {
    const body = JSON.parse(botsRes.body);
    if (body.bots && body.bots[0]) botId = body.bots[0].id;
  } catch (_) {}

  const queueRes = http.post(
    `${MATCHMAKER_URL}/queue`,
    JSON.stringify({ time_control: 'blitz', opponent: { type: 'bot', bot_id: botId } }),
    { headers, tags: { name: 'Enter queue' } },
  );
  check(queueRes, { 'enter queue 201': (r) => r.status === 201 });

  let queueToken = null;
  try {
    queueToken = JSON.parse(queueRes.body).queue_token;
  } catch (_) {}

  sleep(Math.random() * 1.5 + 0.5); // 0.5–2 s, simulates user wait

  if (queueToken) {
    const leaveRes = http.del(
      `${MATCHMAKER_URL}/queue/${queueToken}`,
      null,
      { headers, tags: { name: 'Leave queue' } },
    );
    // 204 = left queue, 404 = already matched (both acceptable, mirrors MatchMakerSim)
    check(leaveRes, { 'leave queue 204 or 404': (r) => r.status === 204 || r.status === 404 });
  }

  logout();
}
