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

`Anything.LLM` is a first-class context boundary for prompt rendering, context package assembly, invocation, streaming status, response decoding, provider health, and policy lookup.

`Anything.LLM.Provider` is a behaviour isolating provider-specific APIs. Production adapters implement real providers. Tests use deterministic fake adapters. Normal tests must not call real providers.

Provider configuration uses secret references such as environment variable names or secret-store keys. API keys and raw secret values are never events, projections, vector memory, prompt logs, raw response artifacts, generated artifacts, or event model files.

Model policies are named and versioned records. Initial policy names are `model_patch_default`, `code_generation_default`, `repair_default`, `learning_extraction_default`, and `component_selection_default`. A policy chooses provider, model, temperature, max tokens, timeout, retry budget, streaming mode, and output schema.

Prompt templates are versioned artifacts with purpose, required context sections, output schema, token budget, and redaction policy. Context packages are deterministic typed prompt inputs. Each context item records source, retrieval query, rank or score when vector-sourced, token estimate, sensitivity classification, and inclusion reason.

Structured outputs are mandatory. Model patch responses, code-generation manifests, component decisions, learning candidates, and repair attempts must conform to versioned JSON or YAML schemas before any domain command records them.

Streaming is not authoritative domain state. Stream chunks may update PubSub/UI status and optional draft artifact logs. Only a completed, schema-valid provider result can dispatch domain commands such as `RecordModelPatchProposal` or `RecordGeneratedCode`.

Prompt and response validation failures are event-modeled and feed bounded repair attempts. Invocation idempotency keys prevent duplicate external calls. Token usage, latency, provider errors, retry counts, rate-limit responses, and estimated cost are projected into provider health and cost views.

LLM use cases are modeled separately: `model_patch`, `model_patch_repair`, `code_generation`, `code_repair`, `component_selection`, and `learning_extraction`.

## Agentic Architecture Via Gamelan

Agentic behavior follows the Gamelan shape: information in, a pure state-machine fold, typed requests out, source results back in as events. Session state is rebuildable from the event log. The pure side does not perform I/O; sources perform effects such as LLM calls, embedding calls, code artifact storage, build/test execution, component registry retrieval, vector search, and future tool/MCP requests.

Checks live at boundaries: redaction, structured-output validation, strict completeness validation, human approval, command authorization, generated-code safety, and tool approval. Product/gate/hold coordination prevents duplicate pending requests and blocks unchecked data from advancing.

Candidate session boundaries are `defect_intake`, `event_modeler`, `code_generator`, `component_designer`, `verifier_repair`, and `learning_curator`. Multi-agent topology is introduced only when it creates useful memory isolation, trust separation, or failure isolation.

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
