// Comparable to MatchMakerSim: matchmaking queue enter and leave.
// Flow: register → login → GET /bots → POST /queue (bot match) → DELETE /queue → logout.
// Generates a unique username per VU per iteration so register never 409s,
// mirroring the always-fresh-user strategy in MatchMakerSim.
// Includes a per-request p99 threshold on queue entry, mirroring the
// details("Enter queue").responseTime.percentile(99) < 1500 assertion in
// MatchMakerSim — the most precise assertion in the Gatling suite.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { register, login, logout, bearerAuthHeaders } from '../helpers/auth.js';
import { MATCHMAKER_URL } from '../config/env.js';

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
  // Pattern mirrors MatchMakerSim: "mm<vuId><epochSeconds mod 1e6>"
  const username = `mm${__VU}${Math.floor(Date.now() / 1000) % 1000000}`;
  const password = 'TestPass123!';

  if (!register(username, password)) return;

  const token = login(username, password);
  if (!token) {
    logout();
    return;
  }

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
