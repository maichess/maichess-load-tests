package config

import io.gatling.core.Predef.*
import io.gatling.http.Predef.*

object ServiceConfig:

  private def prop(key: String, fallback: String): String =
    sys.props.getOrElse(key, sys.env.getOrElse(key.toUpperCase.replace('.', '_'), fallback))

  val authUrl         = prop("auth.url",          "https://staging.auth.maichess.berger-software.com")
  val userUrl         = prop("user.url",          "https://staging.users.maichess.berger-software.com")
  val matchMakerUrl   = prop("matchmaker.url",    "https://staging.matchmaker.maichess.berger-software.com")
  val matchManagerUrl = prop("matchmanager.url",  "https://staging.matchmanager.maichess.berger-software.com")
  val analysisUrl     = prop("analysis.url",      "https://staging.analysis.maichess.berger-software.com")

  val baseProtocol =
    http.acceptHeader("application/json")
        .contentTypeHeader("application/json")
        .disableFollowRedirect
