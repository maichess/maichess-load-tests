// NEW — Breakpoint test: stepwise VU ramp to identify capacity limits.
// Each step holds for 2 minutes so steady-state metrics stabilise before
// the next step is applied. The failing step reveals the system's saturation
// point — watch error rate and p95 latency in the k6 output or Grafana.
//
// The scenario is intentionally lightweight (login → profile → bots → logout)
// so the bottleneck reflects infrastructure capacity, not test complexity.
// No hard thresholds are set — this test is observational by design. Run it
// and look for the step where http_req_failed or http_req_duration spikes.
//
// Steps: 10 → 20 → 40 → 80 → 120 → 160 → 200 VUs (2 min each).
// Adjust MAX_VUS with --env MAX_VUS=300 if the system has not broken by 200.
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { login, logout, bearerAuthHeaders, cookieAuthHeaders } from '../helpers/auth.js';
import { parseCsv } from '../helpers/csv.js';
import { USER_URL, MATCHMAKER_URL } from '../config/env.js';

const users = new SharedArray('users', function () {
  return parseCsv(open('../../src/test/resources/feeders/users.csv'));
});

const maxVus = parseInt(__ENV.MAX_VUS || '200', 10);

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Math.round(maxVus * 0.05) },  // 10 VUs @ 200 max
        { duration: '2m', target: Math.round(maxVus * 0.10) },  // 20
        { duration: '2m', target: Math.round(maxVus * 0.20) },  // 40
        { duration: '2m', target: Math.round(maxVus * 0.40) },  // 80
        { duration: '2m', target: Math.round(maxVus * 0.60) },  // 120
        { duration: '2m', target: Math.round(maxVus * 0.80) },  // 160
        { duration: '2m', target: maxVus },                     // 200
        { duration: '1m', target: 0 },                          // drain
      ],
      gracefulRampDown: '30s',
    },
  },
  // No hard pass/fail thresholds — this run is for observation.
  // Add --out influxdb=... or --out cloud to capture time-series data.
  thresholds: {},
};

export default function () {
  const user = users[(__VU - 1) % users.length];
  const token = login(user.username, user.password);
  if (!token) return;

  // Lightweight read path: profile check
  http.get(`${USER_URL}/users/me`, {
    headers: cookieAuthHeaders(token),
    tags: { name: 'Profile check (breakpoint)' },
  });

  // Lightweight write path: list bots (read-only, no side effects)
  const botsRes = http.get(`${MATCHMAKER_URL}/bots`, {
    headers: bearerAuthHeaders(token),
    tags: { name: 'List bots (breakpoint)' },
  });
  check(botsRes, { 'bots 200': (r) => r.status === 200 });

  logout();
}
