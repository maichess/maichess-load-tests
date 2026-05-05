import http from 'k6/http';
import { check } from 'k6';
import { AUTH_URL } from '../config/env.js';

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

// Registers a new user. Returns true on 201, false otherwise.
// The auth service auto-creates a session on register — call logout() before
// an explicit login if you need a clean session (e.g. in auth lifecycle tests).
export function register(username, password) {
  const res = http.post(
    `${AUTH_URL}/auth/register`,
    JSON.stringify({ username, password }),
    { headers: JSON_HEADERS, tags: { name: 'Register' } },
  );
  check(res, { 'register 201': (r) => r.status === 201 });
  return res.status === 201;
}

// Logs in and returns the access_token JWT string.
// k6 automatically stores the Set-Cookie response in the jar for the auth
// domain, so subsequent calls to auth endpoints (e.g. logout, refresh) need
// no explicit token. For cross-domain services, pass the returned token to
// bearerAuthHeaders() or cookieAuthHeaders() as appropriate.
export function login(username, password) {
  const res = http.post(
    `${AUTH_URL}/auth/login`,
    JSON.stringify({ username, password }),
    { headers: JSON_HEADERS, tags: { name: 'Login' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  const cookie = res.cookies['access_token'];
  return cookie && cookie[0] ? cookie[0].value : null;
}

// Logs out the current session. The auth-domain cookie is sent automatically
// by k6's cookie jar so no explicit token is needed.
export function logout() {
  const res = http.post(
    `${AUTH_URL}/auth/logout`,
    null,
    { headers: { Accept: 'application/json' }, tags: { name: 'Logout' } },
  );
  check(res, { 'logout 204': (r) => r.status === 204 });
}

// Headers for services that use Authorization: Bearer (MatchMaker, MatchManager, Analysis).
export function bearerAuthHeaders(token) {
  return { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
}

// Headers for the User service, which reads the JWT from the access_token cookie.
export function cookieAuthHeaders(token) {
  return { ...JSON_HEADERS, Cookie: `access_token=${token}` };
}
