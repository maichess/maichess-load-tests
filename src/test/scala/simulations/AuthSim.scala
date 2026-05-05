package simulations

import config.ServiceConfig
import io.gatling.core.Predef.*
import io.gatling.http.Predef.*
import scala.concurrent.duration.*

class AuthSim extends Simulation:

  val httpProtocol = ServiceConfig.baseProtocol.baseUrl(ServiceConfig.authUrl)

  // Each VU registers once — use queue so no two VUs share a username.
  val feeder = csv("feeders/users.csv").queue

  val authScenario = scenario("Auth full lifecycle")
    .feed(feeder)
    .exec(
      http("Register")
        .post("/auth/register")
        .body(StringBody("""{"username":"#{username}","password":"#{password}"}"""))
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
        .body(StringBody("""{"username":"#{username}","password":"#{password}"}"""))
        .check(status.is(200))
    )
    .exec(getCookieValue(CookieKey("access_token").saveAs("accessToken")))
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
