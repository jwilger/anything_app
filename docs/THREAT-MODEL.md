# Threat Model

## Scope

This baseline threat model covers the Phoenix 1.8 application shell introduced by issue #7: HTTP routing, cookie-backed sessions, CSRF protection, LiveView socket connection setup, development-only tooling routes, production runtime secrets, and local Postgres access.

Future issues must update this document when they introduce authentication, authorization, Commanded dispatch, durable event payloads, LLM/provider calls, vector memory, generated code artifacts, background jobs, webhooks, or production deployment topology.

## Trust Boundaries

### Browser To Phoenix Endpoint

- Public browser requests enter through `AnythingWeb.Endpoint` and `AnythingWeb.Router`.
- The browser pipeline fetches sessions and LiveView flash, sets the root layout, enables CSRF protection, and applies secure browser headers.
- CSRF tokens are exposed to client JavaScript for Phoenix forms and LiveView requests.

Controls:

- Keep CSRF protection enabled for browser routes that mutate state.
- Keep secure browser headers enabled for browser routes.
- Add explicit authentication and authorization plugs before any sensitive route or LiveView is added.

### Cookie Session

- Sessions are stored in signed cookies under `_anything_key`.
- Signed cookies prevent tampering but do not hide contents from the browser.
- Current baseline stores no sensitive application data in the session.

Controls:

- Do not store secrets, tokens, raw provider responses, private prompts, or sensitive domain data in the session.
- Store only identifiers or small non-sensitive flags when future features need session state.
- Revisit cookie `secure` and encryption settings before introducing authentication or sensitive session state.

### LiveView Socket

- LiveView connects through `/live` and receives the same signed session options as normal browser requests.
- The baseline has no custom LiveViews or LiveView authorization boundary yet.

Controls:

- Future LiveViews that show user, defect, model, event, provider, artifact, or memory data must authorize access during mount and before command dispatch.
- LiveView events must validate and authorize server-side; client events are untrusted input.

### Development Routes

- LiveDashboard and Swoosh mailbox preview are enabled only when `:dev_routes` is true.
- Generated comments warn that dashboard access in production requires authentication and SSL.

Controls:

- Keep `:dev_routes` disabled outside development.
- Do not expose mailbox previews, dashboards, or request logs publicly.

### Postgres Access

- Local development and tests use the Compose Postgres service on loopback port `55432` with local default credentials.
- Production requires `DATABASE_URL` at runtime.

Controls:

- Do not commit production database URLs or credentials.
- Require TLS and certificate verification before using remote production Postgres outside a trusted private network.
- Future migrations must create required extensions, constraints, and indexes in every environment that needs them.

### Runtime Secrets

- Production requires `SECRET_KEY_BASE` and `DATABASE_URL` from the environment.
- Root `.env*` files are ignored to reduce accidental secret commits.

Controls:

- Keep raw secrets out of events, projections, vector memory, logs, prompts, generated artifacts, and source control.
- Store secret references, not secret values, in future provider and policy configuration.

## Current Non-Goals

The baseline does not yet include users, authentication, command authorization, Commanded aggregates/events, LLM provider calls, generated code loading, vector memory, webhooks, background jobs, or production deployment hardening beyond generated Phoenix defaults. Those features must extend this threat model when implemented.
