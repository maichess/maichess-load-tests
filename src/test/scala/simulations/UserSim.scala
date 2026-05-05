package simulations

import config.ServiceConfig
import io.gatling.core.Predef.*
import io.gatling.http.Predef.*
import scala.concurrent.duration.*

class UserSim extends Simulation:

  val httpProtocol = ServiceConfig.baseProtocol

  val userScenario = scenario("User profile read and update")
    .exec(session =>
      val username = s"us${session.userId}${System.currentTimeMillis() / 1000 % 1000000}"
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
      http("Get own profile")
        .get(s"${ServiceConfig.userUrl}/users/me")
        .header("Cookie", "access_token=#{accessToken}")
        .check(status.is(200))
        .check(jsonPath("$.username").exists)
    )
    // Unique temporary username — appends userId+timestamp to avoid concurrent collisions.
    .exec(session => session.set("newUsername", s"upd${session.userId}t${System.currentTimeMillis() / 1000 % 100000}"))
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
