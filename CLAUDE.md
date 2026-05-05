# maichess-load-tests

Load and performance tests for the maichess microservice platform. Two complementary frameworks are used:

- **Gatling** (Scala/sbt) — scenario-based load tests with detailed HTML reports, under `src/`
- **k6** (JavaScript) — lightweight smoke/spike/soak tests, under `k6/`

## Stack

### Gatling
- **Gatling** — load testing framework
- **Scala 3** — test language
- **sbt** — build tool (see `build.sbt`)

### k6
- **k6** — load testing tool (must be installed separately)
- **JavaScript/ES modules** — test language
- **npm scripts** — convenience wrappers (see `k6/package.json`)

## Project Layout

```
src/
  test/scala/
    simulations/   — Gatling Simulation classes (one per scenario or service)
    scenarios/     — reusable scenario/chain definitions
    feeders/       — data feeders (user credentials, FEN strings, etc.)
    config/        — base URLs, headers, shared config

k6/
  tests/           — k6 test scripts (one per service or test type)
  config/          — shared k6 config (thresholds, options)
  helpers/         — shared utility functions
  package.json     — npm scripts for running tests locally or against staging
```

Gatling requires simulation classes to live under `src/test/scala`.

## Services Under Test

The following services expose HTTP endpoints that are candidates for load testing. Base URLs are configured via environment variables or `config/` objects — do not hardcode them.

| Service | Tech | Entry points |
|---|---|---|
| Auth | Express.js | `POST /auth/register`, `POST /auth/login` |
| User | ASP.NET | user profile REST API |
| Match Maker | ASP.NET | session init REST API |
| Match Manager | ASP.NET | move submission REST API |
| Analysis | ASP.NET | game/session management REST API |
| Socket | socket.io | WebSocket connections (not HTTP load tested directly) |

gRPC services (Move Validator, Engine, Database Service) are internal — test them indirectly by driving the HTTP-facing services above, not directly.

Refer to `../maichess-api-contracts/rest/` for exact endpoint paths, request/response schemas, and auth requirements before writing any scenario.

## Conventions

### Authentication

Most endpoints require a JWT. Obtain tokens in a `setUp` or shared feeder by hitting `POST /auth/login` once, then inject the token into subsequent requests via the `Authorization: Bearer <token>` header.

### Scenarios

Each Simulation should represent one coherent user journey, for example:
- **RegisterAndLogin** — create account, log in, assert token returned
- **FullMatchFlow** — log in → enter matchmaking → play moves until game ends
- **AnalysisLoad** — log in → import PGN → start analysis session → receive updates

### Feeders

- FEN strings for the chess board positions live in `src/test/resources/feeders/fens.csv`
- User credentials (for seeded test users) live in `src/test/resources/feeders/users.csv`
- Do not hard-code test data inside simulation classes

### Assertions

Every simulation must define at least:
- `global.responseTime.max` threshold
- `global.successfulRequests.percent` threshold (e.g. ≥ 99%)

## Running Tests

### Gatling
```bash
sbt "Gatling/test"                          # run all simulations
sbt "Gatling/testOnly simulations.AuthSim"  # run a single simulation
```
Results are written to `target/gatling/`.

### k6
```bash
# From the k6/ directory:
npm run test:auth                   # run auth tests against configured URLs
npm run test:local:auth             # run auth tests against localhost

k6 run tests/auth.test.js           # run directly with k6
```
Base URLs are passed via environment variables (see `package.json` scripts). Do not hardcode them.

## What NOT to Do

- Do not test gRPC services directly — drive them through the HTTP layer
- Do not hardcode base URLs — use config objects (Gatling) or environment variables (k6)
- Do not share mutable state between virtual users
- Do not check in `target/` output (Gatling results) or k6 output files
