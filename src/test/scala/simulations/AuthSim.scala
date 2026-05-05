package simulations

import config.ServiceConfig
import io.gatling.core.Predef.*
import io.gatling.http.Predef.*
import scala.concurrent.duration.*

class AuthSim extends Simulation:

  val httpProtocol = ServiceConfig.baseProtocol.baseUrl(ServiceConfig.authUrl)

  // Generate a unique username per VU per run so register never 409s on reruns.
  // Pattern: "ar<userId><epochSeconds mod 1e6>" — stays within the 3–32 char limit.
  val authScenario = scenario("Auth full lifecycle")
    .exec(session =>
      val username = s"ar${session.userId}${System.currentTimeMillis() / 1000 % 1000000}"
      session.setAll("regUsername" -> username, "regPassword" -> "TestPass123!")
    )
    .exec(
      http("Register")
        .post("/auth/register")
        .body(StringBody("""{"username":"#{regUsername}","password":"#{regPassword}"}"""))
        .check(status.is(201))
        .check(jsonPath("$.user_id").saveAs("userId"))
    )
    .exec(
      http("Logout after register")
        .post("/auth/logout")
        .check(status.is(204))
    )
    .exec(
      http("Login")
        .post("/auth/login")
        .body(StringBody("""{"username":"#{regUsername}","password":"#{regPassword}"}"""))
        .check(status.is(200))
    )
    .exec(getCookieValue(CookieKey("access_token").withDomain(ServiceConfig.cookieDomain).saveAs("accessToken")))
    .pause(1.second, 3.seconds)
    .exec(
      http("Refresh token")
        .post("/auth/refresh")
        .check(status.is(200))
    )
    .exec(
      http("Logout")
        .post("/auth/logout")
        .check(status.is(204))
    )

  setUp(
    authScenario.inject(rampUsers(50).during(60.seconds))
  ).protocols(httpProtocol)
   .assertions(
     global.responseTime.max.lt(2000),
     global.successfulRequests.percent.gte(99)
   )
