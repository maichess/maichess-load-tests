// Comparable to AuthSim: full auth service lifecycle under ramp load.
// Tests register → logout (session cleared after register) → login → refresh → logout.
// Generates a unique username per VU per iteration so register never 409s on
// reruns and every HTTP request is expected to succeed — mirrors the always-201
// pattern in AuthSim exactly.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { register, login, logout } from '../helpers/auth.js';
import { AUTH_URL } from '../config/env.js';

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
  // Pattern mirrors AuthSim: "ar<vuId><epochSeconds mod 1e6>"
  const username = `ar${__VU}${Math.floor(Date.now() / 1000) % 1000000}`;
  const password = 'TestPass123!';

  if (!register(username, password)) return;

  // Auth service creates a session on register; clear it before the explicit login.
  logout();

  sleep(Math.random() * 2 + 1); // 1–3 s, mirrors AuthSim pause

  const token = login(username, password);
  if (!token) return;

  const refreshRes = http.post(
    `${AUTH_URL}/auth/refresh`,
    null,
    { headers: { Accept: 'application/json' }, tags: { name: 'Refresh token' } },
  );
  check(refreshRes, { 'refresh 200': (r) => r.status === 200 });

  logout();
}
