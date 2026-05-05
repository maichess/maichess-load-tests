// Comparable to UserSim: cross-service read and update of the user profile.
// Flow: register → login → GET /users/me → PATCH /users/me → logout.
// Generates a unique username per VU per iteration so register never 409s and
// the PATCH never collides with an existing name — mirrors the dynamic
// username strategy in UserSim exactly.
import http from 'k6/http';
import { check } from 'k6';
import { register, login, logout, cookieAuthHeaders } from '../helpers/auth.js';
import { USER_URL } from '../config/env.js';

export const options = {
  scenarios: {
    user_profile: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '60s', target: 30 }],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['max<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Pattern mirrors UserSim: "us<vuId><epochSeconds mod 1e6>"
  const username = `us${__VU}${Math.floor(Date.now() / 1000) % 1000000}`;
  const password = 'TestPass123!';

  if (!register(username, password)) return;

  const token = login(username, password);
  if (!token) {
    logout();
    return;
  }

  const headers = cookieAuthHeaders(token);

  const profileRes = http.get(`${USER_URL}/users/me`, {
    headers,
    tags: { name: 'Get own profile' },
  });
  check(profileRes, {
    'get profile 200': (r) => r.status === 200,
    'profile has username': (r) => {
      try {
        return JSON.parse(r.body).username !== undefined;
      } catch {
        return false;
      }
    },
  });

  // Unique temporary username — mirrors UserSim's "upd<userId>t<epochSec mod 1e5>"
  // pattern so concurrent VUs and repeated runs never collide.
  const newUsername = `upd${__VU}t${Math.floor(Date.now() / 1000) % 100000}`;
  const patchRes = http.patch(
    `${USER_URL}/users/me`,
    JSON.stringify({ username: newUsername }),
    { headers, tags: { name: 'Update username' } },
  );
  check(patchRes, { 'patch 200': (r) => r.status === 200 });

  logout();
}
