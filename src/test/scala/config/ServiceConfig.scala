package config

import io.gatling.core.Predef.*
import io.gatling.http.Predef.*

object ServiceConfig:

  private def prop(key: String, fallback: String): String =
    sys.props.getOrElse(key, sys.env.getOrElse(key.toUpperCase.replace('.', '_'), fallback))

  val authUrl         = prop("auth.url",          "https://auth.staging.maichess.berger-software.com")
  val userUrl         = prop("user.url",          "https://users.staging.maichess.berger-software.com")
  val matchMakerUrl   = prop("matchmaker.url",    "https://matchmaker.staging.maichess.berger-software.com")
  val matchManagerUrl = prop("matchmanager.url",  "https://matchmanager.staging.maichess.berger-software.com")
  val analysisUrl     = prop("analysis.url",      "https://analysis.staging.maichess.berger-software.com")

  // Domain used to look up cookies set by the auth service.
  // Auth cookies use Domain=<parent domain> so services on sibling subdomains share them.
  // Derived by stripping the first subdomain label from the auth host, or overridden via -Dcookie.domain=...
  // Examples: "auth.staging.example.com" -> "staging.example.com"
  //           "http://auth-service"      -> "auth-service"
  val cookieDomain: String = prop("cookie.domain", {
    val host = authUrl.stripPrefix("https://").stripPrefix("http://").split("/")(0)
    val parts = host.split("\\.")
    if (parts.length > 2) parts.tail.mkString(".") else host
  })

  val baseProtocol =
    http.acceptHeader("application/json")
        .contentTypeHeader("application/json")
        .disableFollowRedirect
