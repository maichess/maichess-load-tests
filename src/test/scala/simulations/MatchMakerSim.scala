package simulations

import config.ServiceConfig
import io.gatling.core.Predef.*
import io.gatling.http.Predef.*
import scala.concurrent.duration.*

class MatchMakerSim extends Simulation:

  val httpProtocol = ServiceConfig.baseProtocol

  val matchMakerScenario = scenario("Matchmaking queue enter and leave")
    .exec(session =>
      val username = s"mm${session.userId}${System.currentTimeMillis() / 1000 % 1000000}"
      session.setAll("regUsername" -> username, "regPassword" -> "TestPass123!")
    )
    .exec(
      http("Register")
        .post(s"${ServiceConfig.authUrl}/auth/register")
        .body(StringBody("""{"username":"#{regUsername}","password":"#{regPassword}"}"""))
        .check(status.is(201))
    )
    .exec(
      http("Login")
        .post(s"${ServiceConfig.authUrl}/auth/login")
        .body(StringBody("""{"username":"#{regUsername}","password":"#{regPassword}"}"""))
        .check(status.is(200))
    )
    .exec(getCookieValue(CookieKey("access_token").withDomain(ServiceConfig.cookieDomain).saveAs("accessToken")))
    .exec(
      http("List bots")
        .get(s"${ServiceConfig.matchMakerUrl}/bots")
        .check(status.is(200))
        .check(jsonPath("$.bots[0].id").saveAs("botId"))
    )
    .exec(
      http("Enter queue")
        .post(s"${ServiceConfig.matchMakerUrl}/queue")
        .header("Authorization", "Bearer #{accessToken}")
        .body(StringBody(
          """{"time_control":"blitz","opponent":{"type":"bot","bot_id":"#{botId}"}}"""
        ))
        .check(status.is(201))
        .check(jsonPath("$.queue_token").saveAs("queueToken"))
    )
    // A real client would wait for the socket `matched` event. In the load test
    // we simulate a brief think before cancelling.
    .pause(500.milliseconds, 2.seconds)
    .exec(
      http("Leave queue")
        .delete(s"${ServiceConfig.matchMakerUrl}/queue/#{queueToken}")
        .header("Authorization", "Bearer #{accessToken}")
        // 204 = cancelled; 404 = already matched and token consumed — both fine.
        .check(status.in(204, 404))
    )
    .exec(
      http("Logout")
        .post(s"${ServiceConfig.authUrl}/auth/logout")
        .check(status.is(204))
    )

  setUp(
    matchMakerScenario.inject(rampUsers(40).during(60.seconds))
  ).protocols(httpProtocol)
   .assertions(
     global.responseTime.max.lt(3000),
     global.successfulRequests.percent.gte(99),
     details("Enter queue").responseTime.percentile(99).lt(1500)
   )
