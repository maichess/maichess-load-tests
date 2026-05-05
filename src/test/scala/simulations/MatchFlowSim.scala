package simulations

import config.ServiceConfig
import io.gatling.core.Predef.*
import io.gatling.http.Predef.*
import scala.concurrent.duration.*

/**
 * Tests the Match Manager HTTP endpoints (get state, legal moves, submit move, resign).
 *
 * PREREQUISITE: matches.csv must be populated with ongoing bot matches before running
 * this simulation. The match_id is delivered only via socket.io and cannot be discovered
 * via REST. Populate the CSV with rows of the form:
 *   username,password,match_id
 *
 * To create matches: log in as a load test user, POST /queue with a bot opponent, and
 * capture the match_id from the socket.io `matched` event.
 */
class MatchFlowSim extends Simulation:

  val httpProtocol = ServiceConfig.baseProtocol

  val feeder = csv("feeders/matches.csv").queue

  val matchFlowScenario = scenario("Match Manager — get state, move, resign")
    .feed(feeder)
    .exec(
      http("Login")
        .post(s"${ServiceConfig.authUrl}/auth/login")
        .body(StringBody("""{"username":"#{username}","password":"#{password}"}"""))
        .check(status.is(200))
    )
    .exec(getCookieValue(CookieKey("access_token").withDomain(ServiceConfig.cookieDomain).saveAs("accessToken")))
    .exec(
      http("Get match state")
        .get(s"${ServiceConfig.matchManagerUrl}/matches/#{match_id}")
        .header("Authorization", "Bearer #{accessToken}")
        .check(status.is(200))
        .check(jsonPath("$.status").saveAs("matchStatus"))
    )
    .exec(
      http("Get legal moves")
        .get(s"${ServiceConfig.matchManagerUrl}/matches/#{match_id}/legal-moves")
        .header("Authorization", "Bearer #{accessToken}")
        .check(status.is(200))
        .check(jsonPath("$.moves[0]").saveAs("firstMove"))
    )
    .doIf(session => session("matchStatus").as[String] == "ongoing")(
      exec(
        http("Submit move")
          .post(s"${ServiceConfig.matchManagerUrl}/matches/#{match_id}/moves")
          .header("Authorization", "Bearer #{accessToken}")
          .body(StringBody("""{"move":"#{firstMove}"}"""))
          // 200 = accepted; 403 = not our turn (bot already moved back); 409 = game ended
          .check(status.in(200, 403, 409))
      )
    )
    .exec(
      http("Resign")
        .post(s"${ServiceConfig.matchManagerUrl}/matches/#{match_id}/resign")
        .header("Authorization", "Bearer #{accessToken}")
        // 200 = resigned; 409 = match already ended
        .check(status.in(200, 409))
    )
    .exec(
      http("Logout")
        .post(s"${ServiceConfig.authUrl}/auth/logout")
        .check(status.is(204))
    )

  setUp(
    matchFlowScenario.inject(rampUsers(10).during(30.seconds))
  ).protocols(httpProtocol)
   .assertions(
     global.responseTime.max.lt(5000),
     global.successfulRequests.percent.gte(95)
   )
