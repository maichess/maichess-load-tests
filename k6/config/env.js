// Base URLs resolved from environment variables, with staging fallbacks.
// Override at runtime: k6 run --env AUTH_URL=http://localhost:3000 tests/auth.test.js
// Mirrors the resolution order in src/test/scala/config/ServiceConfig.scala.
export const AUTH_URL =
  __ENV.AUTH_URL || 'https://staging.auth.maichess.berger-software.com';
export const USER_URL =
  __ENV.USER_URL || 'https://staging.users.maichess.berger-software.com';
export const MATCHMAKER_URL =
  __ENV.MATCHMAKER_URL || 'https://staging.matchmaker.maichess.berger-software.com';
export const MATCHMANAGER_URL =
  __ENV.MATCHMANAGER_URL || 'https://staging.matchmanager.maichess.berger-software.com';
export const ANALYSIS_URL =
  __ENV.ANALYSIS_URL || 'https://staging.analysis.maichess.berger-software.com';
