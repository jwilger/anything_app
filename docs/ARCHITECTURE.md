# Anything Architecture

## Purpose And Product Shape

Anything is a defect-driven application-building framework. The user works through a chat and defect console, states what is not working, and describes the expected behavior. The system evolves the application by updating an event model first, validating that model, generating code from the validated model, running focused tests and compile gates, loading safe changes, and asking for the next defect.

The framework is itself event-sourced. Its own defect workflow, LLM requests, model patches, validation results, generated artifacts, build attempts, and learning extraction are observable and replayable from durable events.

## ARCH-1 Decisions

These decisions verify the planning assumptions and guide dependent work.

- The foundation stack is Phoenix 1.8, LiveView, Tailwind 4, daisyUI, Postgres, EventStore, Commanded, `commanded_ecto_projections`, and `pgvector`.
- The checked-in Nix flake and Compose service are the project-pinned development environment. Do not introduce another toolchain manager unless a later ADR changes this.
- Architecture documentation and canonical event model artifacts precede Phoenix runtime behavior and code-generation runtime work.
- Forgejo roadmap materialization is allowed early after plan approval, using `tea` or Forgejo API tooling and body-level dependency links where true dependency support is unavailable.
- Deterministic fake LLM providers, schema validation, prompt/template contracts, and redaction policy come before normal workflow use of a real provider adapter.
- The internal component registry and Atomic Design vocabulary are product architecture, not optional UI polish.
- Generated source content is stored as artifact references with hashes, retention policy, and sensitivity classification. Events store metadata and references, not large source blobs.
- Model patch acceptance is manual for the bootstrap workflow package. Policy automation can be modeled later.
- Code loading starts conservative: generated code is compiled and tested through a modeled safety boundary before any live route uses it. The final in-process versus external runner choice remains implementation-level until tests demand one.
- Command-specific aggregates use explicit stream identifiers. Shared stream prefixes are allowed only where a modeled invariant requires them.
- Canonical YAML event model files come first. Rendered swim-lane or diagram views can be generated later.
- Raw prompts and provider responses are retained only as optional bounded artifacts with hashes, retention, and sensitivity classification. Retention may be disabled.
- Streaming LLM output is UI/progress only until a completed response passes schema validation and is translated through a command.

ARCH-1 establishes these target architecture concerns as first-class and non-optional for dependent work: runtime boundaries, the event model as the architectural source of truth, the bootstrap workflow package, strict completeness validation, Commanded/Postgres/projection/vector-memory storage, daisyUI-backed internal components, code-generation safety, security/trust boundaries, and verification gates.

## Runtime Architecture

The application runtime uses Phoenix and Commanded boundaries deliberately.

- Phoenix 1.8 provides the web application and LiveView as the primary UI surface.
- Phoenix contexts are the public application API. Routes, controllers, LiveViews, components, and channels stay thin.
- Commanded owns write-side dispatch, command routing, aggregates, process managers, and event handling.
- Postgres EventStore persists durable events.
- `commanded_ecto_projections` projects events into Ecto read models.
- Postgres read models support query and UI state.
- `pgvector` in the same Postgres service stores pattern memory, slice memory, component registry search vectors, and past-defect retrieval vectors.
- Phoenix.PubSub carries UI progress updates from projections and build workflow status.
- Oban or supervised workers are introduced only when an async/background concern needs durable retry beyond Commanded process managers.

## Event Model As Source Of Truth

The event model is the source of architectural truth for behavior, generated code, validation, and LLM context. It is a first-class artifact, not a generated summary. Canonical files live under `event_model/` as one YAML file per slice.

Each slice can declare commands, events, aggregate state evolution, projections, screens, components, automations, translations, LLM invocations, memory references, and scenarios. The LLM proposes event model patches before production code changes. Deterministic validators check patched models before code generation. Code generators and prompts consume only validated models.

Existing events are durable contracts. Model patches must be additive unless explicit versioning, upcasting, and compatibility handling are modeled.

## Vertical Slice Mapping

- `state_change` maps to command structs, aggregate `execute/apply` clauses, event structs, GWT aggregate tests, and optional command screens.
- `state_view` maps to Ecto read model schemas, projectors, query functions, LiveView/read screens, and GT projection tests.
- `automation` maps to Commanded process managers or supervised handlers that react to events, read declared read models/vector memories, compute declared outputs, and dispatch commands.
- `translation` maps external events or responses, such as LLM and embedding API responses, into internal commands.
- `design_system` maps internal component registry entries to compile-time Phoenix component implementations.
- `memory` maps projection-backed vector memory entries and retrieval queries.

## Bootstrap Workflow Package

The initial model is a bootstrap workflow package made of multiple vertical slices, not one slice. The package covers defect filing and status views, current event model projection, context retrieval, LLM context packaging, prompt selection, provider invocation, streaming progress, structured-output validation, model patch proposal receipt, strict completeness checking, user review, model patch application, code generation, component selection, generated tests, compile/load attempts, defect verification, and learning extraction.

## LLM Integration Architecture

`Anything.LLM` is a first-class context boundary for prompt rendering, context package assembly, invocation, streaming status, response decoding, provider health, provider policy lookup, telemetry, artifact retention decisions, redaction, and event-sourced invocation audit. Phoenix UI code and Commanded handlers do not call provider SDKs directly; they call context APIs or dispatch modeled commands that result in LLM work.

LLM use cases are modeled separately: `model_patch`, `model_patch_repair`, `code_generation`, `code_repair`, `component_selection`, and `learning_extraction`. Each use case names its prompt template, context package contract, output schema, provider policy, redaction policy, retention policy, and terminal failure behavior in the event model before runtime code may invoke it.

### Provider Behaviour And Adapters

`Anything.LLM.Provider` is a behaviour isolating provider-specific APIs. The behaviour accepts a normalized provider request containing a provider request ID, model identifier, rendered prompt or message sequence artifact reference, structured-output schema reference, timeout, streaming mode, idempotency key, and redacted provider options. It returns tagged outcomes: successful completed response, streaming chunks followed by completion, rate limit, retryable provider failure, terminal provider failure, timeout, or malformed provider response.

Production adapters implement real providers behind the behaviour and translate provider-specific payloads into the normalized result shape at the boundary. Provider-specific metadata may be retained only as classified artifact metadata or allow-listed telemetry fields. Provider SDK response bodies are never treated as domain facts until translated through structured-output validation and an internal command.

Tests use deterministic fake adapters. Normal tests must not call real providers. The deterministic provider supports fixtures for successful structured responses, streaming chunk sequences, malformed output, rate limits, transient failures, terminal failures, and timeouts so policies, retries, validation, and projections can be tested without network access or live credentials.

Provider configuration uses secret references such as environment variable names or secret-store keys. API keys and raw secret values are never events, projections, vector memory, prompt logs, raw response artifacts, generated artifacts, or event model files.

### Provider Policies

Model policies are named and versioned records. Initial policy names are `model_patch_default`, `code_generation_default`, `repair_default`, `learning_extraction_default`, and `component_selection_default`. A policy chooses provider, model, temperature, max tokens, timeout, retry budget, streaming mode, output schema, redaction policy, retention policy, circuit-breaker bucket, rate-limit bucket, and cost budget.

Policy lookup happens before prompt rendering and provider invocation. Policy decisions are recorded by name and version so an invocation can be replayed for audit without depending on mutable current configuration. Policy changes are additive or versioned; historical invocation events keep their original policy version.

### Prompt Template Registry

Prompt templates are versioned artifacts with purpose, owner, required context sections, optional context sections, output schema, token budget, redaction policy, retention policy, and compatibility notes. Templates do not embed secrets or environment-specific values. Template variables must bind to declared context-package fields, not ad hoc maps.

The prompt template registry supports deterministic rendering: the same template version and context package produce the same provider input except for explicit system-generated fields such as invocation IDs or timestamps. Template evolution is additive when possible; incompatible changes require a new template version and validation of every event-model slice that references it.

### Context Package Assembly

Context packages are deterministic typed prompt inputs assembled before rendering. Each package records its use case, package schema version, template reference, policy reference, source event or command, and ordered context sections. Each context item records source, retrieval query, rank or score when vector-sourced, token estimate, sensitivity classification, redaction status, artifact hash or event ID when available, and inclusion reason.

Context assembly may read event model artifacts, read models, vector memories, component registry entries, generated artifact metadata, previous validation results, and user-supplied defect text. Vector retrieval results are evidence, never authoritative business state. Items that fail sensitivity or redaction policy are excluded and recorded as excluded context metadata rather than silently included.

### Structured Output Schemas

Structured outputs are mandatory. Model patch responses, code-generation manifests, component decisions, learning candidates, and repair attempts must conform to versioned JSON or YAML schemas before any domain command records them.

Schemas reject forbidden fields such as `chain_of_thought`, raw secrets, bearer tokens, cookies, undeclared provider payloads, and arbitrary file writes. Validation produces typed success or actionable validation errors. A schema-valid response still remains untrusted until downstream model validation, generated-code safety gates, tests, compile checks, and human approval accept it.

### Streaming Semantics

Streaming is not authoritative domain state. Stream chunks may update PubSub/UI status and optional draft artifact logs. Stream chunks are correlated by provider request ID and sequence number, may be dropped from retention by policy, and must not dispatch domain commands.

Only a completed, schema-valid provider result can dispatch domain commands such as `RecordModelPatchProposal` or `RecordGeneratedCode`. If a stream ends without a valid completion, the invocation records a terminal validation or provider failure and follows the configured repair or retry path.

### Retry, Rate-Limit, And Circuit-Breaker Policy

Prompt and response validation failures are event-modeled and feed bounded repair attempts. Invocation idempotency keys prevent duplicate external calls. Retries are bounded by policy and distinguish provider transport failures, rate limits, timeouts, malformed provider responses, and schema-validation failures.

Rate-limit handling records provider, model, bucket, reset information when supplied, and retry-after decisions. Circuit breakers are keyed by policy/provider/model bucket and open after configured failure thresholds. Open circuits short-circuit new invocations into a modeled blocked state rather than repeatedly calling an unhealthy provider. Half-open probes and circuit close events are audited.

### Token, Cost, And Health Telemetry

Token usage, latency, provider errors, retry counts, rate-limit responses, circuit-breaker transitions, and estimated cost are projected into provider health and cost views. Telemetry events include invocation ID, use case, policy version, provider, model, token counts, latency buckets, retry count, error category, and cost estimate; they exclude prompt text, response text, secrets, and sensitive context content.

Telemetry supports budget enforcement and operator visibility but is not a substitute for durable audit events. When providers omit exact token or cost data, projections mark estimates explicitly.

### Prompt And Response Artifact Retention

Raw prompts and provider responses are retained only as optional bounded artifacts with hashes, retention, and sensitivity classification. Retention may be disabled per policy or environment. Events store artifact references, hashes, classification, and retention decisions, not large prompt/response bodies.

Artifact retention records the template version, context package manifest hash, provider request metadata, response artifact hash, schema validation result, retention expiry, and redaction status. Generated code artifacts follow the generated-artifact retention contract rather than being embedded in LLM events.

### Redaction

Redaction runs before provider invocation and before optional prompt/response artifact retention. Redaction policy considers session data, user-entered defect text, event payload sensitivity, vector memory sensitivity, generated source, logs, provider credentials, and configured forbidden patterns. Redaction decisions are deterministic where possible and recorded as metadata: policy version, fields redacted, items excluded, and whether manual review is required.

LLM output is also scanned before retention and translation. Output that includes suspected secrets, undeclared sensitive data, or forbidden payload fields is rejected or quarantined according to policy and cannot advance into domain commands.

### Event-Sourced Invocation Audit

Every LLM invocation is auditable through durable events. The audit trail records request intent, use case, provider policy version, prompt template version, context package manifest hash, redaction result, provider request ID, idempotency key, retry attempts, streaming lifecycle, provider result category, structured-output validation result, artifact references and hashes, token/cost telemetry summary, and terminal outcome.

Audit events avoid secrets, unnecessary PII, and large raw bodies. Replays rebuild invocation status, provider health views, cost views, artifact manifests, and downstream workflow decisions from events and referenced artifacts. Duplicate delivery and retries are safe because invocation IDs and provider idempotency keys are stable across attempts.

## Agentic Architecture Via Gamelan

Anything's agentic runtime adopts Gamelan as the target architecture, realized with BEAM supervision, Commanded events, and Phoenix boundaries. Gamelan is not merely inspiration: its session, transducer, source, check, product/gate/hold, replay, and composition contracts are the architectural shape for the defect-driven agent loop.

### Session Contract

A session is the universal runtime unit. An agent is a session. A network coordinating agents is also a session. A session receives events through a mailbox, folds them through pure coordination state, emits typed requests, and receives source results back as events.

The mailbox contract is:

- **Sequential:** one event is folded at a time. The fold never runs concurrently for the same session.
- **Durable:** every accepted event is appended to the event log before or atomically with processing.
- **Idempotent:** duplicate event delivery is a no-op or deterministic replay of an already recorded result.

Session state is rebuildable from the event log. Live state, snapshots, projections, and UI status are caches of replayable facts, not sources of truth. Every event, request, source result, check verdict, retry decision, and terminal outcome needed for coordination replay is durable. Optional raw prompt/response artifacts may expire, but replay-critical manifests, hashes, classifications, and decisions remain event-sourced.

On the BEAM, a session maps naturally to a supervised process or process group that owns sequential fold execution, while Commanded/EventStore persists the durable event stream. A crashed session resumes by replaying its stream or by restoring a trusted snapshot plus subsequent events.

### Transducers And The Pure Fold

The state machine inside a session is a pure fold over events. It is composed of transducers. Each transducer has two responsibilities:

- **Project:** update its own declared state slots from the current event.
- **Generate:** emit typed requests based on its state and the current event.

Transducers do not perform I/O, call providers, write files, query databases, send PubSub messages, or dispatch commands directly. They return desired requests. The runtime performs effects through sources and records results as events.

Multiple transducers compose by product/co-projection: every transducer sees every event, each owns disjoint state slots, and independent transducers cannot overwrite each other's state. Slot disjointness and dependency validity are load-time validation concerns for modeled transducers and implementation-review concerns for trusted native transducers.

Anything uses two transducer forms:

- **Modeled transducers:** event-model data that can later compile to constrained transducer definitions. These are the long-term path for customizable coordination, prompt/context assembly decisions, memory summarization, provider selection, and tool/request sequencing.
- **Native transducers:** trusted Elixir modules for platform coordination where the event model has not yet demanded a data VM or where BEAM/Commanded integration is implementation-owned. Native transducers keep the same pure `project`/`generate` contract.

The constrained transducer language and VM from Gamelan are the compatibility target for future customizable coordination. Until that VM exists in this repository, event-model slices must still declare enough session, state-slot, source, request, result, and check metadata for deterministic validation and later migration.

### Sources And Connections

Sources perform effects outside the fold. LLM providers, embedding providers, tool executors, artifact storage, build/test runners, component registry search, vector search, human approval, guardrail checks, MCP/tool adapters, and other sessions are sources.

Every source declares a typed interface:

- `dispatch(request, config) -> result`
- `discover(config) -> capabilities`
- `interface() -> request/result pairs`

Connections bind sessions to sources with policy and optional checks. The session fold derives dispatch rules from source interfaces and connection topology rather than hardcoding event types. Request/result pairs define how pending requests are tracked and which result clears which pending key.

From outside, a session is also a source. This makes composition uniform: an agent delegates to another agent the same way it calls a tool, and a network delegates to child sessions the same way it calls any other source.

### Product, Gate, And Hold

Gamelan's three coordination operators are required runtime behavior:

- **Product:** fold all transducers over each event, producing updated transducer state and a complete list of emitted requests.
- **Gate:** filter emitted requests using pending/check state so a request type or key already in flight cannot dispatch again until its matching result arrives.
- **Hold:** intercept configured inbound events or outbound requests for checks; while a check is pending, no unchecked data advances and no gated generators dispatch.

The turn cycle is:

1. Yield receives the next durable event.
2. Clear matching pending state if the event is a source result.
3. Run any inbound hold/check before the fold consumes the event.
4. Product-fold all transducers over the approved event.
5. Gate emitted requests by pending and hold state.
6. Run outbound hold/checks for configured requests.
7. Dispatch approved requests through sources.
8. Add dispatched request keys to pending state.
9. Yield with pending state captured for the next turn.

This contract prevents duplicate provider/tool calls, prevents generated requests from acting on unchecked LLM output, and gives deterministic replay/debugging behavior. Quiescence means no pending requests and no held checks remain.

### Checks And Guardrails

Checks live on connections and can apply inbound or outbound. A check source returns one of three verdicts:

- **Approve:** continue with the original request or event.
- **Reject:** drop or record a modeled rejection without advancing unchecked data.
- **Transform:** continue with a modified value, such as redacted prompt context or sanitized output.

Check errors, timeouts, and unavailable check sources are modeled outcomes, not implicit approvals. Safety-critical checks fail closed: redaction, structured-output validation, strict completeness validation, human approval, command authorization, generated-code safety, tool approval, provider response guardrails, cross-session trust checks, and gateway policy cannot be bypassed because the check source failed. A fail-closed check either remains held until an operator/system retry resolves it or records a terminal blocked/rejected event according to the connection policy.

Anything uses checks for redaction, structured-output validation, strict completeness validation, human approval, command authorization, generated-code safety, tool approval, provider response guardrails, cross-session trust checks, and future gateway policy. Checks themselves are sources, so a check can be a deterministic function, a human workflow, a local policy engine, another session, or a bounded LLM-based classifier when the risk model permits it.

### Inner Fold And Session Fold Separation

The inner fold owns domain/session coordination state: message history summaries, context package assembly state, pending tool-call intent, model-patch workflow phase, generation/repair state, and learning extraction state.

The session fold owns runtime coordination state: pending request keys, connection topology, held check state, dispatch rules, and source routing. The inner fold cannot modify session-fold state. The session fold cannot mutate transducer state except by feeding events through the inner fold. This separation keeps proof-carrying Gamelan properties applicable to the BEAM implementation and keeps effects outside the pure coordination boundary.

### Agent And Network Topology

Candidate agent session boundaries are `defect_intake`, `event_modeler`, `code_generator`, `component_designer`, `verifier_repair`, and `learning_curator`. A single-agent topology is acceptable until tests and modeled workflow pressure require separation. Multi-agent topology is introduced only when it creates useful memory isolation, trust separation, lifecycle isolation, or failure isolation.

A network session coordinates agent sessions. It tracks agent lifecycle, delegation, routing, failure propagation, cancellation, and trust checks. Delegation is a typed request/result flow through sources; child session completion, failure, cancellation, and timeout return as events to the coordinating session. Network coordination must prevent delegation cycles that would deadlock, preserve session-local state isolation, and record enough events to recover after crashes.

### Channels And Federation

User channels and agent channels are adapters around the source/session contract. Phoenix HTTP, LiveView, CLI, webhook, and future chat adapters translate external protocol messages into durable session events and translate session output events back to the external channel. Local BEAM calls, store-backed cross-node delivery, and future A2A/MCP-style protocols are agent-channel choices, not changes to the core session model.

Cross-boundary agent communication goes through gateways. Gateway policy covers ingress and egress, evaluates declared scope and capability, applies trust checks, and fails closed when the trust checker is unavailable. External agents cannot directly reach internal sessions without gateway-mediated checks. Federation is not required for the bootstrap workflow, but the architecture must not preclude it.

### Verification Mapping

Anything inherits Gamelan's verification posture as architecture, then realizes it incrementally with project tests:

- Transducer/session topology contracts are deterministic and should be covered by contract tests and property tests.
- Pure transducer logic is tested with event sequences and replay assertions.
- Source adapters are integration-tested with deterministic fakes before real providers/tools.
- LLM prompt/context quality is evaluated with evals and human review because provider behavior is non-deterministic.
- Safety boundaries use checks, redaction tests, schema validation tests, generated-code compile/test gates, and threat-model review.

The event model must eventually be able to declare session definitions, transducer slots, source interfaces, connection topology, checks, request/result pairs, pending keys, and replay scenarios so Gamelan-style runtime contracts can be validated before code generation.

## Commanded Write-Side Pattern

Commanded usage follows a single aggregate-per-command mapping, adapted from `commanded_boilerplate` after compatibility review.

- Each command module owns its command struct, validation, authorization, handler, and aggregate decision logic.
- Commands self-register with the router by convention.
- Validation middleware and authorization middleware run before aggregate execution.
- The default lifecycle is `stop_after_command_event_or_error` unless explicit retention is justified.
- Shared workflow state is represented by streams, projections, and process managers rather than a single shared aggregate.
- Event model slices must declare command module, command fields and sources, aggregate name, aggregate stream id, stream prefix, `single_aggregate_per_command` pattern, router registration, middleware order, lifespan, events, and idempotency key where relevant.

Any deviation from this convention is ADR-level debt and needs migration tests.

## Strict Information Completeness Gate

The strict completeness validator is a hard gate after every model patch and before code generation. It returns `:ok` or structured errors containing slice, path, offending reference, and remediation hint.

The validator checks reference integrity, command/event field sources, aggregate state evolution, projection/read-model mappings, screen/UI bindings, automation dispatch fields, translation boundaries, scenarios, event compatibility, component registry references, memory/vector usage, and LLM invocation completeness.

Validation is deterministic and independent of LLM judgment. It is necessary but not sufficient; GWT/GT tests, compile gates, security checks, runtime verification, and human review still apply.

## Code Generation And Hot-Load Safety

Generated code comes from validated event model artifacts. Generated changes are written through scoped reviewable patches. Tests and compile gates run in a controlled boundary before any live behavior is swapped. Existing behavior remains active if generation, tests, compile, projection rebuild, or module load fails.

Every generation, artifact record, compile result, load result, failure, and retry is recorded as an event. Projections are rebuilt or shadow-rebuilt before LiveViews route users to new read models. Durable event contracts are never silently mutated.

## Postgres Data Architecture

Postgres stores EventStore tables, projection/read-model tables, `pgvector` tables, and bounded artifact metadata. Artifact tables store generated patch/code bundle metadata when events would otherwise become too large or sensitive.

LLM invocation projections include prompt template versions, context package manifests, provider request metadata, structured output validation status, token/cost telemetry, and artifact references. Constraints and indexes enforce durable data invariants. Event payloads avoid secrets and unnecessary PII.

## UI And Design System

The UI starts with Phoenix 1.8 defaults, Tailwind 4, and daisyUI. Internal compile-time Phoenix components capture recurring app-specific UI needs. Atomic Design is used as vocabulary: atoms, molecules, organisms, and templates.

### daisyUI Usage

daisyUI is the default visual primitive library for generated and hand-written Phoenix components. Raw daisyUI and Tailwind class choices belong at the lowest practical component layer so higher-level components express intent through props, slots, and composition instead of repeating class strings.

- Atoms may wrap daisyUI primitives such as `btn`, `input`, `alert`, `badge`, `card`, `modal`, `steps`, `timeline`, and `menu` when the wrapper adds product naming, validation, accessibility, or variant constraints.
- Molecules and organisms compose atoms and may expose limited semantic variants, but they must not introduce unrelated ad hoc Tailwind class bundles when an existing atom or daisyUI primitive fits.
- Templates define layout structure for screens and workflows. They may use Tailwind grid/flex utilities for layout, but reusable visual behavior still belongs in atoms, molecules, or organisms.
- Direct daisyUI use in LiveViews is acceptable only for one-off Phoenix scaffold/default markup before a registry entry exists. When the shape recurs or is generated from the event model, promote it into the registry.

### Internal Compile-Time Component Layers

The internal component library is compile-time Phoenix component code owned by `AnythingWeb`, not runtime data-driven component execution. Registry entries describe and validate those components; they do not execute arbitrary stored markup.

- **Atoms** encapsulate a single control, label, status marker, icon treatment, or daisyUI primitive with product variants and accessibility defaults.
- **Molecules** combine atoms into small reusable interactions such as search boxes, defect summary rows, filter bars, timeline items, or provider status indicators.
- **Organisms** compose molecules and atoms into domain sections such as defect timelines, model-patch review panels, completeness-check result lists, or generated-artifact summaries.
- **Templates** arrange organisms for a screen or workflow step while keeping data loading, commands, and navigation in LiveViews and contexts.

Components stay deterministic and side-effect free. LiveViews and contexts own data retrieval, command dispatch, authorization, PubSub subscriptions, and navigation. Components receive explicit assigns and slots, render accessible markup, and emit normal Phoenix events through their caller.

### Search-First Component Registry

Existing components are searched first. New components or component evolution require registry search evidence and justification. Component registry entries are indexed in vector memory and validated by the event model. Search evidence records the query, relevant candidates, reuse decision, and reason reuse was not sufficient.

The registry supports two related uses:

- **Design-time lookup:** LLM/code-generation and human implementation search the registry before proposing UI changes.
- **Validation:** event-model `design_system` slices prove that screen/component references point to existing registry entries or same-patch proposed entries with search evidence.

Registry entries include component name, module, atomic level, purpose, props, slots, composition dependencies, accepted daisyUI classes or variants, accessibility contract, search keywords, sensitivity classification when rendered data may contain user content, and evolution history.

### Creation And Evolution Rules

A new component is allowed when registry search finds no compatible existing component, when adapting an existing component would blur its purpose, or when accessibility/validation needs require a clearer semantic boundary. Component evolution is preferred over duplication when the existing component has the same purpose and can accept an additive prop, slot, variant, or composition change without breaking callers.

Component changes follow these rules:

- Reuse compatible existing components before creating new entries.
- Keep names domain-specific and stable; avoid generic wrappers that only rename daisyUI classes.
- Add props, slots, and variants additively unless every caller is updated in the same patch.
- Preserve accessibility semantics across variants.
- Record replaced, renamed, or deprecated registry entries so generated code can migrate references deliberately.
- Treat component entry removal as a compatibility change that requires model patch validation and caller updates.

### Accessibility Contract

Accessibility requirements are validation rules, not visual afterthoughts. Every registry entry declares the semantic role or native element strategy, keyboard interaction, focus behavior, visible label or screen-reader label, state announcements for dynamic content, and color/contrast considerations for status or error states.

Interactive components must define disabled/loading/error behavior and keyboard behavior. Components that render user or LLM-provided text must preserve escaping and declare whether truncation, summaries, or expandable details are required. Components that render workflow status must expose status text independently from color or icon shape.

### Validation Expectations

The event model validator checks component references, registry search evidence, Atomic Design level, prop and slot sources, composition dependencies, daisyUI boundaries, accessibility fields, and compatibility of component evolution. A screen or generated UI patch is incomplete when it references an unknown component, bypasses search-first evidence for a new component, omits required accessibility fields, uses raw daisyUI/Tailwind classes above the atom layer without justification, or binds a component prop to an undeclared read-model/query/source field.

## Security And Trust Boundaries

LLM output is untrusted input until validated, tested, compiled, and reviewed by automated gates. Prompt context must pass redaction and sensitivity policy before provider invocation. Provider credentials are referenced by configuration keys only.

Command authorization occurs before dispatch. LiveView/session boundaries, CSRF/session handling, event payload PII, generated code artifacts, hot-load behavior, external LLM calls, vector memory, and artifact storage are explicit threat boundaries. `docs/THREAT-MODEL.md` must be added or updated once the Phoenix app introduces those concrete boundaries.

## Verification Strategy

Before a Mix project exists, architecture/model work is verified by review for terminology, dependency consistency, and manual schema consistency. After the Phoenix app exists, production behavior follows focused RED/GREEN/REFACTOR ExUnit evidence before production edits.

Required gates after the Mix project exists are focused `mix test`, `mix format --check-formatted`, `MIX_ENV=test mix compile --warnings-as-errors --force`, `MIX_ENV=prod mix compile --warnings-as-errors --force`, `mix test --warnings-as-errors`, `mix dialyzer --halt-exit-status` once configured, and configured static/security checks such as `mix credo --strict` and `mix sobelow`.
