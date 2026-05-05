package simulations

import config.{ServiceConfig, TestProfile}
import io.gatling.core.Predef.*
import io.gatling.http.Predef.*
import scala.concurrent.duration.*

class AnalysisSim extends Simulation:

  val httpProtocol = ServiceConfig.baseProtocol

  val fenFeeder = csv("feeders/fens.csv").circular

  val analysisScenario = scenario("Analysis — import FEN game, create and control session")
    .exec(session =>
      val username = s"an${session.userId}${System.currentTimeMillis() / 1000 % 1000000}"
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
      http("Get analysis config")
        .get(s"${ServiceConfig.analysisUrl}/analysis/config")
        .header("Authorization", "Bearer #{accessToken}")
        .check(status.is(200))
        .check(jsonPath("$.default_bot_id").saveAs("defaultBotId"))
        .check(jsonPath("$.default_line_count").saveAs("defaultLineCount"))
    )
    .feed(fenFeeder)
    .exec(
      http("Import game from FEN")
        .post(s"${ServiceConfig.analysisUrl}/games/from-fen")
        .header("Authorization", "Bearer #{accessToken}")
        .body(StringBody("""{"fen":"#{fen}"}"""))
        .check(status.is(201))
        .check(jsonPath("$.id").saveAs("gameId"))
    )
    .exec(
      http("List saved games")
        .get(s"${ServiceConfig.analysisUrl}/games")
        .header("Authorization", "Bearer #{accessToken}")
        .check(status.is(200))
    )
    .exec(
      http("Get game by ID")
        .get(s"${ServiceConfig.analysisUrl}/games/#{gameId}")
        .header("Authorization", "Bearer #{accessToken}")
        .check(status.is(200))
    )
    .exec(
      http("Create analysis session")
        .post(s"${ServiceConfig.analysisUrl}/sessions")
        .header("Authorization", "Bearer #{accessToken}")
        .body(StringBody(
          """{"game_id":"#{gameId}","bot_id":"#{defaultBotId}","line_count":#{defaultLineCount}}"""
        ))
        .check(status.is(201))
        .check(jsonPath("$.session_id").saveAs("sessionId"))
    )
    .exec(
      http("Navigate to starting position")
        .post(s"${ServiceConfig.analysisUrl}/sessions/#{sessionId}/navigate")
        .header("Authorization", "Bearer #{accessToken}")
        .body(StringBody("""{"index":0}"""))
        .check(status.is(200))
    )
    .exec(
      http("Start analysis")
        .post(s"${ServiceConfig.analysisUrl}/sessions/#{sessionId}/analysis")
        .header("Authorization", "Bearer #{accessToken}")
        .body(StringBody("{}"))
        .check(status.is(204))
    )
    // Analysis runs asynchronously and pushes results via socket.io. We pause
    // briefly to simulate a user watching results before stopping.
    .pause(1.second, 3.seconds)
    .exec(
      http("Stop analysis")
        .delete(s"${ServiceConfig.analysisUrl}/sessions/#{sessionId}/analysis")
        .header("Authorization", "Bearer #{accessToken}")
        .check(status.is(204))
    )
    .exec(
      http("Delete session")
        .delete(s"${ServiceConfig.analysisUrl}/sessions/#{sessionId}")
        .header("Authorization", "Bearer #{accessToken}")
        .check(status.is(204))
    )
    .exec(
      http("Logout")
        .post(s"${ServiceConfig.authUrl}/auth/logout")
        .check(status.is(204))
    )

  private val p = TestProfile.profile(baseUsers = 30, maxRespMs = 5000)

  setUp(
    analysisScenario.inject(p.injectionSteps)
  ).protocols(httpProtocol)
   .assertions(p.assertions)
