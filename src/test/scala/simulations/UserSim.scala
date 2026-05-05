package simulations

import config.ServiceConfig
import io.gatling.core.Predef.*
import io.gatling.http.Predef.*
import scala.concurrent.duration.*

class UserSim extends Simulation:

  // No single base URL — requests target different services. Use an empty base
  // and provide absolute URLs on each request.
  val httpProtocol = ServiceConfig.baseProtocol

  // Users are pre-existing (registered via AuthSim or seeded). Use circular so
  // VUs can re-use credentials across repeated runs.
  val feeder = csv("feeders/users.csv").circular

  val userScenario = scenario("User profile read and update")
    .feed(feeder)
    .exec(
      http("Login")
        .post(s"${ServiceConfig.authUrl}/auth/login")
        .body(StringBody("""{"username":"#{username}","password":"#{password}"}"""))
        .check(status.is(200))
    )
    .exec(getCookieValue(CookieKey("access_token").saveAs("accessToken")))
    .exec(
      http("Get own profile")
        .get(s"${ServiceConfig.userUrl}/users/me")
        // User service authenticates via access_token cookie.
        .header("Cookie", "access_token=#{accessToken}")
        .check(status.is(200))
        .check(jsonPath("$.username").exists)
    )
    // Build a unique username per VU so concurrent PATCH calls don't collide.
    .exec(session => session.set("newUsername", s"upd${session.userId}"))
    .exec(
      http("Update username")
        .patch(s"${ServiceConfig.userUrl}/users/me")
        .header("Cookie", "access_token=#{accessToken}")
        .body(StringBody("""{"username":"#{newUsername}"}"""))
        .check(status.is(200))
    )
    .exec(
      http("Logout")
        .post(s"${ServiceConfig.authUrl}/auth/logout")
        .check(status.is(204))
    )

  setUp(
    userScenario.inject(rampUsers(30).during(60.seconds))
  ).protocols(httpProtocol)
   .assertions(
     global.responseTime.max.lt(3000),
     global.successfulRequests.percent.gte(99)
   )
