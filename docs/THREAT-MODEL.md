# Threat Model

## Scope

This baseline threat model covers the Phoenix 1.8 application shell introduced by issue #7 and the architecture-level LLM/Gamelan boundaries documented by issue #5: HTTP routing, cookie-backed sessions, CSRF protection, LiveView socket connection setup, development-only tooling routes, production runtime secrets, local Postgres access, LLM provider calls, prompt/context/response handling, generated code artifacts, and event-sourced agent invocation audit.

Future issues must update this document when they introduce concrete authentication, authorization, Commanded dispatch, durable event payload tables, vector memory tables, generated code loading, background jobs, webhooks, federation gateways, or production deployment topology.

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

### LLM Provider Boundary

- LLM provider SDKs and APIs are external, untrusted effects reached through `Anything.LLM.Provider` adapters.
- Provider requests may contain sensitive prompt context, generated source, event-model excerpts, user-entered defect text, and retrieved memory.
- Provider responses are untrusted input and may contain malformed data, prompt injection, secret-looking strings, unsafe code, or undeclared payload fields.

Controls:

- Use deterministic fake providers in normal tests; real providers require explicit integration configuration and must not run in default test gates.
- Store provider credentials only as secret references. Never record raw API keys, bearer tokens, cookies, or private keys in events, projections, logs, vector memory, prompt artifacts, response artifacts, generated artifacts, or event model files.
- Run redaction before provider invocation and before optional artifact retention.
- Treat provider responses as domain facts only after structured-output validation and internal command translation.
- Use idempotency keys, bounded retries, rate-limit handling, and circuit breakers so failures do not create duplicate or uncontrolled external calls.

### Prompt Context And Vector Memory

- Prompt context may include event model content, read models, vector memory results, component registry entries, generated artifact metadata, validation results, and user defect text.
- Vector memory retrieval results are evidence and may carry sensitive historical context.

Controls:

- Classify every context item by sensitivity before inclusion.
- Record source, retrieval query, rank or score, token estimate, redaction status, artifact hash or event ID, and inclusion reason.
- Exclude or transform items that fail redaction/sensitivity policy and record exclusion metadata.
- Do not treat vector retrieval as authoritative business state.

### Prompt And Response Artifacts

- Raw prompts and raw provider responses may be retained only as optional bounded artifacts.
- Retained artifacts may include sensitive user, model, memory, or generated-code content.

Controls:

- Retention is policy-controlled and may be disabled.
- Store artifact references, hashes, classifications, redaction status, retention expiry, and validation status in events; do not embed large raw bodies in events.
- Restrict artifact access to authorized operator/debug workflows when those workflows exist.
- Ensure replay-critical audit state does not depend on optional artifacts that may expire.

### Event-Sourced Agent Invocation Audit

- Agent sessions record invocation intent, policy/template versions, context manifests, provider request IDs, idempotency keys, retry attempts, check verdicts, validation results, token/cost telemetry summaries, and terminal outcomes as durable events.
- Durable events can accidentally become long-lived PII stores if payloads are not minimized.

Controls:

- Events store metadata and references, not raw secrets, unnecessary PII, raw prompts, raw responses, or large generated source blobs.
- Event payloads are additive durable contracts; compatibility changes require versioning/upcasting plans.
- Projectors and handlers must be idempotent under replay and duplicate delivery.

### Generated Code And Tool Execution

- Generated code artifacts and tool requests are untrusted until validated, reviewed, tested, and compiled through declared gates.
- LLM output may attempt arbitrary file writes, command execution, dependency changes, or bypass of authorization and safety checks.

Controls:

- Structured output schemas reject arbitrary file writes, forbidden fields, and undeclared provider payloads.
- Generated changes are stored as scoped artifact references with hashes and sensitivity classification.
- Generated code cannot be loaded or routed to live behavior until model validation, generated tests, compile gates, security checks, and human approval pass.
- Tool/source requests that mutate files, dispatch commands, call providers, or cross trust boundaries require declared checks and explicit authorization.

### Gamelan Session And Federation Boundaries

- Agent and network sessions run as event-sourced folds with source effects outside the pure fold.
- Cross-session, cross-node, or future A2A/federated communication can carry generated intent and sensitive context across trust boundaries.

Controls:

- Keep fold execution sequential per session, append events durably, and handle duplicate delivery idempotently.
- Use checks on inbound and outbound connection boundaries. Safety-critical checks fail closed, including redaction, structured-output validation, generated-code safety, tool approval, provider response guardrails, command authorization, trust boundaries, and gateway policy.
- Treat check-source errors, unavailability, and timeouts as held or terminal blocked/rejected states, never as implicit approval.
- Prevent unchecked provider, tool, or external-agent data from advancing while a check is unresolved.
- Route external agents through gateways rather than direct access to internal sessions.

## Current Non-Goals

The baseline does not yet include users, authentication, concrete command authorization, implemented Commanded aggregates/events, concrete vector memory tables, generated code hot-loading, webhooks, background jobs, federation gateways, or production deployment hardening beyond generated Phoenix defaults. Those features must extend this threat model when implemented.
