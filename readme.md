# Default (load profile, per-sim user counts)
sbt "Gatling/testOnly simulations.AuthSim"

# Smoke — 2 VUs, 10 s, just verify endpoints respond
sbt -Dtest.type=smoke "Gatling/test"

# Stress — 2× users, relaxed thresholds (max response ×2, success ≥95%)
sbt -Dtest.type=stress "Gatling/testOnly simulations.MatchMakerSim"

# Spike — warm-up → 3× sudden burst → cool-down
sbt -Dtest.type=spike "Gatling/test"

# Soak — N/2 users sustained for 10 minutes
sbt -Dtest.type=soak "Gatling/testOnly simulations.AnalysisSim"

# Breakpoint — 9 ramps from N/3 up to 3×N, find capacity ceiling
sbt -Dtest.type=breakpoint "Gatling/test"

# Override user count for any profile
sbt -Dtest.type=load -Dload.users=100 "Gatling/test"

Each profile scales the assertion thresholds automatically — stress/spike/breakpoint relax both the response-time ceiling and the success-rate floor so the test doesn't assert-fail on scenarios that are
intentionally over-capacity.