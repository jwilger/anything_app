# Threat Model

## Scope

This baseline threat model covers the Phoenix 1.8 application shell introduced by issue #7 and the target LLM/code-generation architecture: HTTP routing, cookie-backed sessions, CSRF protection, LiveView socket connection setup, development-only tooling routes, production runtime secrets, local Postgres access, untrusted LLM/provider output, prompt/vector memory sensitivity, event payload sensitivity, generated code artifacts, hot-load boundaries, external API calls, command authorization, and validation/test/compile gates.

Future issues must update this document when they introduce authentication, authorization, Commanded dispatch, durable event payloads, LLM/provider calls, vector memory, generated code artifacts, background jobs, webhooks, or production deployment topology.

## Assumptions

- The Phoenix baseline is a generated application shell with no users, authentication, Commanded write side, LLM provider adapter, vector memory, generated artifact store, or hot-load runtime yet.
- Target architecture decisions in `docs/ARCHITECTURE.md` are security requirements for dependent implementation issues, not optional design notes.
- Generated code, provider responses, model patches, prompt inputs, browser events, and external API responses are untrusted until they cross the explicit gates documented here.

## Trust Boundaries

### Browser To Phoenix Endpoint

- Public browser requests enter through `AnythingWeb.Endpoint` and `AnythingWeb.Router`.
- The browser pipeline fetches sessions and LiveView flash, sets the root layout, enables CSRF protection, and applies secure browser headers.
- CSRF tokens are exposed to client JavaScript for Phoenix forms and LiveView requests.

Controls:

- Keep CSRF protection enabled for browser routes that mutate state.
- Keep secure browser headers enabled for browser routes.
- Add explicit authentication and authorization plugs before any sensitive route or LiveView is added.
- Authorize and tenant/user-scope sensitive reads from contexts, projections, vector memory, provider health/cost views, and artifact metadata before returning data to browser routes or LiveViews.
- Validate all request and LiveView event parameters server-side; never trust client-side validation or generated UI constraints as an authorization boundary.

### Cookie Session

- Sessions are stored in signed cookies under `_anything_key`.
- Signed cookies prevent tampering but do not hide contents from the browser.
- Current baseline stores no sensitive application data in the session.

Controls:

- Do not store secrets, tokens, raw provider responses, private prompts, or sensitive domain data in the session.
- Store only identifiers or small non-sensitive flags when future features need session state.
- Before authentication or sensitive session state is introduced, require secure cookies in production and decide whether signed-only cookies remain sufficient or encrypted cookies are required.

### LiveView Socket

- LiveView connects through `/live` and receives the same signed session options as normal browser requests.
- The baseline has no custom LiveViews or LiveView authorization boundary yet.

Controls:

- Future LiveViews that show user, defect, model, event, provider, artifact, or memory data must authorize access during mount and before command dispatch.
- LiveViews must authorize and tenant/user-scope every sensitive context read and projection subscription, not only write commands.
- LiveView events must validate and authorize server-side; client events are untrusted input.
- Socket session data must remain minimal and non-sensitive because it is derived from the cookie session boundary.

### Development Routes

- LiveDashboard and Swoosh mailbox preview are enabled only when `:dev_routes` is true.
- Generated comments warn that dashboard access in production requires authentication and SSL.

Controls:

- Keep `:dev_routes` disabled outside development.
- Do not expose mailbox previews, dashboards, or request logs publicly.
- If dashboard or mailbox access is ever enabled outside local development, protect it with authentication, authorization, and SSL-only access first.

### Postgres Access

- Local development and tests use the Compose Postgres service on loopback port `55432` with local default credentials.
- Production requires `DATABASE_URL` at runtime.

Controls:

- Do not commit production database URLs or credentials.
- Require TLS and certificate verification before using remote production Postgres outside a trusted private network.
- Future migrations must create required extensions, constraints, and indexes in every environment that needs them.
- Treat local Postgres credentials as development-only; production deployments must provide credentials through runtime secret loading.

### Runtime Secrets

- Production requires `SECRET_KEY_BASE` and `DATABASE_URL` from the environment.
- Root `.env*` files are ignored to reduce accidental secret commits.

Controls:

- Keep raw secrets out of events, projections, vector memory, logs, prompts, generated artifacts, and source control.
- Store secret references, not secret values, in future provider and policy configuration.

### Command Authorization

- Commanded commands are a planned write-side boundary; no Commanded dispatch exists in the baseline shell.
- Browser actions, LiveView events, external translations, process managers, and LLM-generated model patches may all try to produce commands in later slices.

Controls:

- Authorize every command before dispatch, using explicit caller context and command-specific policy.
- Authorize sensitive reads with the same explicit caller context before returning projections, vector memory, provider telemetry, or artifact metadata.
- Do not hide authorization inside aggregates, projectors, or generic handlers where reads or side effects could already have occurred.
- Treat LLM-suggested commands and model patches as proposals requiring validation and, where policy requires, human approval before dispatch.

### Durable Events And Event Payload PII

- Events are replayable durable contracts; accidental secrets or unnecessary PII in event payloads become long-lived data exposure.
- Future events may record defects, model patches, validation results, generated artifact metadata, provider invocation metadata, cost telemetry, and workflow decisions.

Controls:

- Events must store metadata, identifiers, hashes, artifact references, policy names, schema versions, and sensitivity classifications instead of raw secrets, API keys, large source blobs, raw prompts, raw provider responses, or unnecessary PII.
- Event shape changes must be additive or explicitly versioned with compatibility handling before historical replay depends on the new shape.
- Projectors and handlers must be idempotent so replay and retry do not duplicate sensitive side effects.

### LLM Providers And External API Calls

- Provider prompts, context packages, streaming chunks, structured responses, embedding calls, and provider error payloads cross an external trust boundary.
- Provider APIs may retain data, return malformed content, inject prompt instructions, leak sensitive context, fail partially, or produce unsafe code/model patches.

Controls:

- Production provider adapters must use secret references for credentials; raw provider keys must never enter prompts, events, projections, logs, generated artifacts, vector memory, or source control.
- Prompt context must pass redaction and sensitivity policy before invocation.
- Normal tests must use deterministic fake providers and must not call real providers.
- Completed provider responses must pass versioned structured-output validation before any domain command records or acts on them.
- Streaming output is UI/progress only until a completed response validates successfully.
- Invocation idempotency keys, retry budgets, timeouts, cost telemetry, and provider health projections must prevent duplicate or runaway external calls.

### Prompt Context And Vector Memory

- Prompt context packages and vector memories can contain user defects, event-model details, code snippets, retrieved prior work, component metadata, and sensitivity labels.
- Retrieval can surface stale, over-broad, or more-sensitive-than-needed content.

Controls:

- Every context item must record source, retrieval query, rank or score when vector-sourced, token estimate, sensitivity classification, and inclusion reason.
- Redaction policy must run before context leaves the system for a provider.
- Retention for raw prompt/response artifacts must be bounded and may be disabled.
- Vector memory must not store raw secrets, provider keys, session data, production credentials, or unnecessary PII.

### Generated Code Artifacts

- Generated patches, code bundles, tests, manifests, and repair attempts are untrusted artifacts even when produced by a configured provider.
- Generated source can contain malicious code, unsafe dependencies, secret exfiltration, hidden network calls, prompt injection comments, or code that bypasses authorization.

Controls:

- Generated source content is stored as artifact references with hashes, retention policy, and sensitivity classification; events store references and metadata rather than large source blobs.
- Artifact storage must enforce read/write authorization, tenant/user scoping, path traversal prevention, retention/deletion policy, and hash verification before use.
- Stored generated artifacts must not be directly served or executed; retrieval must go through an authorized context boundary that verifies metadata, sensitivity classification, and content hash.
- Malware/static checks and dependency review must run before generated artifacts can be promoted toward compilation, tests, or loading.
- Generated changes must be reviewable scoped patches, not direct unchecked mutation of live behavior.
- Dependency additions, network calls, file access, background jobs, command dispatch, and event payload changes from generated code require explicit review and policy approval.
- Generated tests are useful evidence but never the only acceptance gate for generated behavior.

### Code Loading And Hot-Load Boundary

- The target architecture allows generated code to be compiled and tested before any live route or workflow uses it; the exact in-process versus external runner is not yet chosen.
- Loading or routing to generated code before safety gates complete could execute untrusted behavior inside the Phoenix node.

Controls:

- Existing behavior remains active if generation, validation, sandboxed tests, sandboxed compile, projection rebuild, module load, or review fails.
- Generated code must pass model validation, sandboxed focused tests, sandboxed compile gates, and human or policy review before it can become live behavior.
- Projection rebuild or shadow-rebuild must occur before LiveViews route users to new read models.
- Compile and test generated code in an isolated sandbox before any in-node compilation, route activation, process start, migration, dependency fetch, or module load is allowed, because macros, Mix tasks, dependencies, and test setup can execute code.
- The sandbox must receive no production secrets, session data, provider keys, production database credentials, or unrestricted host filesystem access; it must use restricted mounts, constrained network egress, resource and time limits, and explicit allowlists for dependency fetches or other external access.

### Validation, Test, Compile, And Review Gates

- Gates are trust-boundary controls, not just quality checks.
- Model patches, generated code, migrations, dependency changes, and provider responses can only advance when the relevant gate succeeds.

Controls:

- Strict completeness validation must run after every model patch and before code generation.
- Production behavior requires focused RED/GREEN/REFACTOR ExUnit evidence before production edits.
- Required implementation gates after the Mix project exists are focused `mix test`, `mix format --check-formatted`, `MIX_ENV=test mix compile --warnings-as-errors --force`, `MIX_ENV=prod mix compile --warnings-as-errors --force`, `mix test --warnings-as-errors`, `mix dialyzer --halt-exit-status` once configured, and configured static/security checks such as `mix credo --strict` and `mix sobelow`.
- Failed gates must block promotion of generated or manually written behavior; bypasses require an explicit documented decision.

## Production Hardening Decisions And Follow-Up Work

- **Secure session cookies:** before authentication or sensitive session state, configure production cookies to require HTTPS and decide whether session encryption is required in addition to signing.
- **Host/header and SSL redirect assumptions:** before production deployment, document trusted proxy/header topology, configure host checks, and ensure SSL redirects cannot be bypassed by spoofed headers.
- **Health-check exclusions:** if health checks are excluded from SSL redirects or authentication, keep them minimal, non-sensitive, and unauthenticated only when required by the deployment platform.
- **Remote Postgres TLS:** require TLS and certificate verification for remote production databases unless the database is only reachable over a documented trusted private network.
- **Provider data retention:** document provider retention settings and contractual data-use assumptions before enabling real provider adapters.
- **Generated-code execution isolation:** decide and test the verification runner boundary before generated code can execute outside static analysis and compilation.

## Current Non-Goals

The baseline does not yet include users, authentication, Commanded aggregates/events, LLM provider calls, generated code loading, vector memory, webhooks, background jobs, or production deployment hardening beyond generated Phoenix defaults. Those features must extend this threat model with implementation-specific controls and tests when implemented.
