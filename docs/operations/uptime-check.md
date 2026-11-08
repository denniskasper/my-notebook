# Uptime check

> **Not set up in this demo.** The demo has a public Status page and a health endpoint, and CI checks production after every deploy. An external uptime monitor is described here, not configured.

## Intended setup

An external service polls the health endpoint from outside the server, so it notices what the server can't report itself: the server down, the reverse proxy broken, DNS or the certificate expired. The choice would be [UptimeRobot](https://uptimerobot.com): its free plan is enough for one monitor, and it runs on a different host from production.

| Setting  | Value                                                                       |
| -------- | --------------------------------------------------------------------------- |
| Monitor  | HTTP(s), `GET <PRODUCTION_URL>/api/health`                                  |
| Interval | 5 minutes (the free plan's shortest)                                        |
| Healthy  | Status `200` and the body contains `"status":"ok"`                          |
| Alert    | Email to the developer after two failed checks, and again when it recovers |

`/api/health` answers `503` when the database is down, so the monitor catches a lost database as well as a dead app. It reports the running `commit` too, but the monitor doesn't check it: a new deploy changes it, and the CI `deploy` job already verifies it.

The Status page (`/status`) is the visitor-facing view of the same state; the monitor is the one that wakes someone up.
