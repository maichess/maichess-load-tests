// NEW — Spike test: sudden traffic burst followed by sustained load.
// Validates that the system handles abrupt demand spikes without cascading
// failures. Exercises auth + match-maker since they are the entry point for
// every active user session.
//
// Pattern: 0 → 100 VUs in 10 s (spike), hold 30 s, drain in 10 s.
// Thresholds are deliberately more lenient than the ramp-based tests because
// a spike is expected to cause temporary latency degradation.
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { login, logout, bearerAuthHeaders } from '../helpers/auth.js';
import { parseCsv } from '../helpers/csv.js';
import { MATCHMAKER_URL } from '../config/env.js';

const users = new SharedArray('users', function () {
  return parseCsv(open('../../src/test/resources/feeders/users.csv'));
});

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 }, // abrupt spike
        { duration: '30s', target: 100 }, // sustained burst
        { duration: '10s', target: 0 },   // drain
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'], // p95 tolerance during spike
    http_req_failed: ['rate<0.05'],    // up to 5% failure tolerated
  },
};

export default function () {
  const user = users[(__VU - 1) % users.length];
  const token = login(user.username, user.password);
  if (!token) return;

  const headers = bearerAuthHeaders(token);

  // Enter queue with a bot opponent — immediate match, no wait for socket event
  const queueRes = http.post(
    `${MATCHMAKER_URL}/queue`,
    JSON.stringify({ time_control: 'bullet', opponent: { type: 'bot', bot_id: 'bullet' } }),
    { headers, tags: { name: 'Enter queue (spike)' } },
  );
  check(queueRes, {
    'enter queue 201 or 409': (r) => r.status === 201 || r.status === 409,
  });

  let queueToken = null;
  try {
    queueToken = JSON.parse(queueRes.body).queue_token;
  } catch (_) {}

  if (queueToken) {
    http.del(`${MATCHMAKER_URL}/queue/${queueToken}`, null, { headers, tags: { name: 'Leave queue (spike)' } });
  }

  logout();
}
