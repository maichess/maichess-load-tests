// Comparable to UserSim: cross-service read and update of the user profile.
// Flow: login (auth) → GET /users/me → PATCH /users/me → logout (auth).
// Uses circular selection over the pre-seeded users so multiple VUs can share
// credentials, matching UserSim's circular feeder strategy.
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { login, logout, cookieAuthHeaders } from '../helpers/auth.js';
import { parseCsv } from '../helpers/csv.js';
import { USER_URL } from '../config/env.js';

const users = new SharedArray('users', function () {
  return parseCsv(open('../../src/test/resources/feeders/users.csv'));
});

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
  const user = users[(__VU - 1) % users.length];
  const token = login(user.username, user.password);
  if (!token) return;

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

  // Patch with a deterministic username so repeated runs produce the same
  // value rather than accumulating ever-growing names.
  const newUsername = `upd${user.username}`;
  const patchRes = http.patch(
    `${USER_URL}/users/me`,
    JSON.stringify({ username: newUsername }),
    { headers, tags: { name: 'Update username' } },
  );
  check(patchRes, { 'patch 200': (r) => r.status === 200 });

  logout();
}
