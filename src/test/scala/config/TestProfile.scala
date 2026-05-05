package config

import io.gatling.core.Predef.*
import io.gatling.commons.stats.assertion.Assertion
import io.gatling.core.controller.inject.open.OpenInjectionStep
import scala.concurrent.duration.*

/** Injection profile + assertion bundle returned by [[TestProfile.profile]]. */
final case class ProfileConfig(
  injectionSteps: Seq[OpenInjectionStep],
  assertions: Seq[Assertion]
)

/**
 * Selects a named load-test profile at runtime via system properties.
 *
 * Usage:
 *   sbt -Dtest.type=stress "Gatling/testOnly simulations.AuthSim"
 *   sbt -Dtest.type=load -Dload.users=100 "Gatling/test"
 *
 * Supported profiles:
 *   smoke      — 2 VUs, 10 s ramp. Verifies endpoints are reachable.
 *   load       — N users ramped over 60 s. Baseline perf at expected concurrency.
 *   stress     — ramp to N then inject N more, pushing to 2× load.
 *   spike      — normal load → sudden 3× burst → recover. Tests elasticity.
 *   soak       — moderate load (N/2) sustained for 10 min. Detects leaks / exhaustion.
 *   breakpoint — 9 progressive ramps up to 3×N. Finds the capacity ceiling.
 *
 * Each sim passes its own `baseUsers` and `maxRespMs`; the profile scales accordingly.
 * Override the user count with `-Dload.users=<n>` to skip the per-sim default.
 */
object TestProfile:

  private def prop(key: String, fallback: String): String =
    sys.props.getOrElse(key, sys.env.getOrElse(key.toUpperCase.replace('.', '_'), fallback))

  private def resolveUsers(simDefault: Int): Int =
    prop("load.users", simDefault.toString).toInt

  def profile(baseUsers: Int, maxRespMs: Int, minSuccessPct: Double = 99.0): ProfileConfig =
    val n = resolveUsers(baseUsers)
    prop("test.type", "load") match
      case "smoke"      => smoke(n, maxRespMs, minSuccessPct)
      case "stress"     => stress(n, maxRespMs, minSuccessPct)
      case "spike"      => spike(n, maxRespMs, minSuccessPct)
      case "soak"       => soak(n, maxRespMs, minSuccessPct)
      case "breakpoint" => breakpoint(n, maxRespMs, minSuccessPct)
      case _            => load(n, maxRespMs, minSuccessPct)

  private def assertions(maxRespMs: Int, pct: Double): Seq[Assertion] = Seq(
    global.responseTime.max.lt(maxRespMs),
    global.successfulRequests.percent.gte(pct)
  )

  // 2 users, short ramp — just check every endpoint returns 2xx.
  private def smoke(n: Int, maxRespMs: Int, pct: Double): ProfileConfig =
    ProfileConfig(
      Seq(rampUsers(2).during(10.seconds)),
      assertions(maxRespMs, pct)
    )

  // Baseline: ramp to N over 60 s.
  private def load(n: Int, maxRespMs: Int, pct: Double): ProfileConfig =
    ProfileConfig(
      Seq(rampUsers(n).during(60.seconds)),
      assertions(maxRespMs, pct)
    )

  // Ramp to N, then inject N more (reaching 2× peak).  Thresholds relaxed 2×/−4%.
  private def stress(n: Int, maxRespMs: Int, pct: Double): ProfileConfig =
    ProfileConfig(
      Seq(
        rampUsers(n).during(60.seconds),
        rampUsers(n).during(60.seconds)
      ),
      assertions(maxRespMs * 2, math.max(pct - 4.0, 90.0))
    )

  // Warm-up at N/2, then sudden 3× spike, then cool-down at N/2. Thresholds relaxed 4×/−9%.
  private def spike(n: Int, maxRespMs: Int, pct: Double): ProfileConfig =
    val half = math.max(n / 2, 1)
    ProfileConfig(
      Seq(
        rampUsers(half).during(30.seconds),
        atOnceUsers(n * 3),
        nothingFor(60.seconds),
        rampUsers(half).during(30.seconds)
      ),
      assertions(maxRespMs * 4, math.max(pct - 9.0, 85.0))
    )

  // Moderate sustained load: inject N/2 users per minute for 10 minutes.
  private def soak(n: Int, maxRespMs: Int, pct: Double): ProfileConfig =
    val sustained = math.max(n / 2, 1)
    ProfileConfig(
      Seq(rampUsers(sustained * 10).during(600.seconds)),
      assertions(maxRespMs, pct)
    )

  // Nine progressive ramps from N/3 to 3×N, one minute each.  Thresholds relaxed 3×/−19%.
  private def breakpoint(n: Int, maxRespMs: Int, pct: Double): ProfileConfig =
    ProfileConfig(
      (1 to 9).map(i => rampUsers(math.max(n * i / 3, 1)).during(60.seconds)).toSeq,
      assertions(maxRespMs * 3, math.max(pct - 19.0, 75.0))
    )
