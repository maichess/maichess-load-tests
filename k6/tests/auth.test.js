// Comparable to AuthSim: full auth service lifecycle under ramp load.
// Tests register → (logout if new) → login → refresh → logout.
// Register handles 409 gracefully so the test is safe to re-run without
// a clean database, matching the practical behaviour of AuthSim.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { login, logout } from '../helpers/auth.js';
import { parseCsv } from '../helpers/csv.js';
import { AUTH_URL } from '../config/env.js';

const users = new SharedArray('users', function () {
  return parseCsv(open('../../src/test/resources/feeders/users.csv'));
});

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

export const options = {
  scenarios: {
    auth_lifecycle: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '60s', target: 50 }],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['max<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const user = users[(__VU - 1) % users.length];

  const registerRes = http.post(
    `${AUTH_URL}/auth/register`,
    JSON.stringify({ username: user.username, password: user.password }),
    { headers: JSON_HEADERS, tags: { name: 'Register' } },
  );
  check(registerRes, {
    'register 201 or already exists 409': (r) => r.status === 201 || r.status === 409,
  });

  // A 201 means the auth service created a session; log out before re-logging in.
  if (registerRes.status === 201) {
    logout();
  }

  sleep(Math.random() * 2 + 1); // 1–3 s, mirrors AuthSim pause

  const token = login(user.username, user.password);
  if (!token) return;

  const refreshRes = http.post(
    `${AUTH_URL}/auth/refresh`,
    null,
    { headers: { Accept: 'application/json' }, tags: { name: 'Refresh token' } },
  );
  check(refreshRes, { 'refresh 200': (r) => r.status === 200 });

  logout();
}
