# maichess-load-tests

Gatling load tests for the maichess microservice platform, written in Scala.

## Stack

- **Gatling** — load testing framework
- **Scala 3** — test language
- **sbt** — build tool (see `build.sbt`)

## Project Layout

```
src/
  test/scala/
    simulations/   — Gatling Simulation classes (one per scenario or service)
    scenarios/     — reusable scenario/chain definitions
    feeders/       — data feeders (user credentials, FEN strings, etc.)
    config/        — base URLs, headers, shared config
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

```bash
sbt "Gatling/test"                          # run all simulations
sbt "Gatling/testOnly simulations.AuthSim"  # run a single simulation
```

Results are written to `target/gatling/`.

## What NOT to Do

- Do not test gRPC services directly — drive them through the HTTP layer
- Do not hardcode base URLs — use config objects
- Do not share mutable state between virtual users
- Do not check in `target/` output
