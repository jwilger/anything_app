# Event Model Artifact Schema And Glossary

This document is the canonical human-readable schema for event model artifacts under
`event_model/workflows/<workflow>/*.yaml`. Machine validators may implement a subset
first, but they must not contradict this contract.

## Glossary

- `event model`: the checked-in source of truth for modeled behavior, read models,
  automations, translations, UI component needs, memory flows, and scenarios.
- `workflow`: a named package of related slices. The initial workflow is `bootstrap`.
- `bootstrap workflow package`: the first runnable set of event-modeled slices for
  the defect-driven loop that evolves Anything itself.
- `slice`: one vertical event-modeled unit, such as a state change, state view,
  automation, translation, design-system entry, or memory flow.
- `state_change`: a slice that declares command input, aggregate decision state,
  emitted event contracts, router metadata, and GWT scenarios.
- `state_view`: a slice that declares a read model, projection mappings, query or
  screen bindings, and GT scenarios.
- `automation`: a slice that reacts to modeled events or conditions, reads declared
  state, computes outputs, and dispatches modeled commands.
- `translation`: a slice that turns external boundary events, provider responses, or
  runner results into modeled commands.
- `design_system`: a slice that declares an internal compile-time component registry
  entry and its accessibility, composition, search, and evolution contract.
- `memory`: a slice that records or retrieves vector/read memory with source
  traceability, sensitivity classification, retention, and retrieval rules.
- `field source`: a deterministic reference showing where a modeled command field,
  event field, read-model field, dispatch field, component prop, or memory field gets
  its value.
- `strict information completeness`: deterministic validation that every modeled
  attribute, scenario reference, UI binding, aggregate state reference, automation
  dispatch field, and read-model field traces to a declared upstream source.
- `aggregate state evolution`: explicit declarations showing which events establish
  and update aggregate state used by command decisions.
- `GWT scenario`: Given/When/Then scenario for write-side behavior.
- `GT scenario`: Given/Then scenario for read-model, automation, translation,
  component, or memory behavior when no user command is the trigger.
- `component reference`: a declared dependency on an existing or proposed internal
  component registry entry.
- `memory reference`: a declared dependency on vector or read memory retrieval or on
  a memory record created from a durable event/artifact.
- `event compatibility`: rules preserving durable event contracts across model
  patches and historical replay.

## Artifact Layout

Each slice is one YAML file:

```text
event_model/workflows/<workflow>/<slice>.yaml
```

File names use snake_case and must match the `slice` value. A workflow package is the
set of all slices under its workflow directory.

## Common Slice Fields

Every slice declares these fields:

```yaml
slice: file_defect
type: state_change
workflow: bootstrap
summary: User files the next defect to drive app evolution.
owners:
  context: Anything.Defects
  web: AnythingWeb.DefectConsoleLive
```

Common field rules:

- `slice` is globally unique within a workflow and uses snake_case.
- `type` is one of `state_change`, `state_view`, `automation`, `translation`,
  `design_system`, or `memory`.
- `workflow` names the containing workflow directory.
- `summary` describes product intent, not implementation mechanics.
- `owners.context` names the Phoenix context boundary when the slice maps to runtime
  behavior.
- `owners.web`, `owners.projection`, `owners.process_manager`, `owners.component`,
  or `owners.external_boundary` may be added when the slice touches those boundaries.

## Slice Type Contracts

### `state_change`

State-change slices declare command, aggregate, router, event, and GWT scenario
contracts so command ownership is deterministic.

Required shape:

```yaml
type: state_change
command:
  name: FileDefect
  module: Anything.Defects.Commands.FileDefect
  fields:
    defect_id:
      type: uuid
      source: system.uuid
    description:
      type: string
      source: screen.description
aggregate:
  name: Defect
  module: Anything.Defects.DefectAggregate
  stream_id: command.defect_id
  prefix: defect
  pattern: single_aggregate_per_command
  state:
    defect_id:
      type: uuid
      established_by: DefectFiled.defect_id
router:
  registration: command_self_registers
  middleware:
    - validate_command
    - authorize_command
  lifespan: stop_after_command_event_or_error
events:
  - name: DefectFiled
    version: 1
    fields:
      defect_id:
        type: uuid
        source: command.defect_id
scenarios:
  main_success:
    given: []
    when: FileDefect{description: "missing behavior"}
    then:
      - DefectFiled
```

Required rules:

- Every command has exactly one owning aggregate unless the slice explicitly declares
  an ADR-approved exception.
- `aggregate.pattern` is `single_aggregate_per_command` for bootstrap slices.
- `aggregate.stream_id` references a command, system, session, external, or computed
  source that is stable for all retries of the command.
- `aggregate.state` declares every `aggregate.*` source used by invariants, events,
  dispatches, or scenarios.
- Each aggregate state field declares `established_by` and may declare `updated_by`.
- Events are durable contracts and must include `name`, `version`, and typed `fields`.
- Command validation and authorization run before aggregate execution.
- Retried/external/automation commands declare `router.command_idempotency_key`.
- At least one `main_success` GWT scenario is required, plus validation and invariant
  scenarios for required fields and decision branches.

### `state_view`

State-view slices declare projection-backed read models and their query/screen
bindings.

Required shape:

```yaml
type: state_view
read_model:
  name: DefectStatus
  repo: Anything.Repo
  fields:
    defect_id:
      type: uuid
      pk: true
    status:
      type: string
      source: projection.status
projects_from:
  - event: DefectFiled
    identity:
      defect_id: event.defect_id
    map:
      defect_id: event.defect_id
      status: literal.open
queries:
  by_defect_id:
    input:
      defect_id: screen.defect_id
    returns: one
screen:
  bindings:
    status: read_model.status
scenarios:
  projects_open_status:
    given:
      - DefectFiled
    then:
      - read_model.DefectStatus{status: "open"}
```

Required rules:

- Every read-model field is populated by `projects_from`, a literal/default, or a
  computed query expression.
- Update/delete projection mappings declare identity or where clauses.
- Projection handlers are idempotent under replay and duplicate delivery.
- Screen bindings only reference declared read-model fields, computed query fields, or
  component props.

### `automation`

Automation slices declare event/condition triggers, reads, computed outputs,
dispatches, retries, idempotency, duplicate handling, and scenarios.

Required shape:

```yaml
type: automation
trigger:
  event: ModelPatchProposed
reads:
  - read_model: CurrentEventModel
    by: trigger.workflow
  - vector: PatternMemory
    query: computed.context_query
computed:
  context_query:
    type: string
    source: trigger.summary
dispatches:
  - command: RecordCompletenessCheckResult
    fields:
      check_id: system.uuid
      patch_id: trigger.patch_id
retry:
  policy: bounded
  max_attempts: 3
idempotency_key: trigger.patch_id
duplicate_handling: ignore_after_success
scenarios:
  dispatches_check:
    given:
      - ModelPatchProposed
    then:
      - RecordCompletenessCheckResult
```

Required rules:

- Triggers reference known events, schedules, or explicit conditions.
- Reads reference known read models, vector memories, artifact stores, or external
  boundaries.
- Dispatches reference known commands and provide all required command fields.
- External calls and retried dispatches declare idempotency keys and terminal failure
  behavior.

### `translation`

Translation slices declare external boundary input and deterministic conversion to an
internal command.

Required shape:

```yaml
type: translation
boundary:
  name: llm_provider
  direction: inbound
external_event:
  name: ProviderResponseReceived
  fields:
    provider_request_id:
      type: string
    body_artifact_id:
      type: string
idempotency_key: external.provider_request_id
translates_to:
  command: RecordLLMInvocationResult
  fields:
    provider_request_id: external.provider_request_id
    response_artifact_id: external.body_artifact_id
failure_handling:
  malformed_input: reject_and_record
scenarios:
  records_provider_response:
    given:
      - external.ProviderResponseReceived
    then:
      - RecordLLMInvocationResult
```

Required rules:

- External field shapes are explicit and treated as untrusted input.
- Translated commands reference known command names.
- Translation mappings provide every required command field.
- Failure handling is modeled for malformed, duplicate, and unauthorized input.

### `design_system`

Design-system slices declare reusable internal component registry entries.

Required shape:

```yaml
type: design_system
component:
  name: DefectTimeline
  module: AnythingWeb.Components.DefectTimeline
  atomic_level: organism
  purpose: Show ordered defect workflow events.
  props:
    events:
      type: list
      required: true
      source: read_model.DefectTimeline.events
  slots:
    empty_state:
      optional: true
  composed_from:
    - DefectTimelineRail
    - TimelineItem
  daisy_ui:
    boundary: atom_wrapped
    wrapped_by: DefectTimelineRail
  accessibility:
    role: list
    keyboard: not_applicable
    screen_reader_label: Defect timeline
    focus_behavior: not_applicable
    status_text_required: true
registry:
  search_first: true
  search_evidence: vector.ComponentRegistry.search{query: "timeline status"}
  candidates_considered:
    - ExistingTimeline
  reuse_policy: prefer_existing_compatible_component
  reuse_decision: create_new_component
  reuse_rationale: Existing timeline lacks defect workflow status semantics.
  evolution:
    compatibility: additive
scenarios:
  renders_events:
    given:
      - read_model.DefectTimeline
    then:
      - component.DefectTimeline
```

Required rules:

- Component references point to existing registry entries or same-patch proposed
  entries.
- New components include search evidence explaining why reuse was not sufficient.
- Props and slots have types, requiredness, and sources.
- Accessibility requirements are validation inputs, not optional notes.
- Raw Tailwind/daisyUI choices are encapsulated at the lowest practical Atomic Design
  level.
- `component.atomic_level` is one of `atom`, `molecule`, `organism`, or `template`.
- `component.daisy_ui.boundary` declares whether daisyUI classes are `atom_wrapped`,
  `layout_only`, or `justified_direct_use`. Direct use above the atom layer requires
  a justification in the registry rationale.
- `registry.search_first` is true for new components and for component evolution that
  changes public props, slots, visual variants, or composition dependencies.
- `registry.search_evidence`, `candidates_considered`, `reuse_decision`, and
  `reuse_rationale` are required when introducing a component or choosing not to reuse
  an existing compatible component.
- `registry.evolution.compatibility` records whether a change is `additive`,
  `breaking_with_callers_updated`, `rename_with_migration`, or `deprecation`.
- Accessibility fields include role/native semantics, keyboard behavior, focus
  behavior, visible or screen-reader label strategy, and status/error announcement
  requirements where applicable.
- Validation fails when a component references unknown composed components, undeclared
  prop or slot sources, missing accessibility fields, missing search-first evidence,
  or raw daisyUI/Tailwind use outside the declared boundary.

### `memory`

Memory slices declare memory recording, embedding/indexing, and retrieval semantics.

Required shape:

```yaml
type: memory
memory:
  name: PatternMemory
  operation: record
  source:
    event: DefectResolved
    artifact: artifact.resolution_summary
  fields:
    learning_id:
      type: uuid
      source: system.uuid
    text:
      type: string
      source: artifact.resolution_summary.text
  classification: internal
  sensitivity_policy: redact_before_provider
  retention: bounded
embedding:
  model_policy: learning_embedding_default
  vector_field: text
retrieval:
  query: vector.PatternMemory.search
  returns:
    - learning_id
    - text
    - source_event_id
scenarios:
  records_learning:
    given:
      - DefectResolved
    then:
      - memory.PatternMemory.recorded
```

Required rules:

- Memory records retain source traceability to event IDs, artifact hashes, or model
  slice paths.
- Sensitivity classification is required before memory may be used in prompt context.
- Retrieval results are prompt evidence, never authoritative business state.
- Embedding/index failures have modeled retry or terminal failure behavior.

## Field Source Syntax

Field sources are strings with a namespace prefix and path:

```text
<namespace>.<path>
```

Allowed source namespaces:

- `screen.*`: user-provided LiveView/form input declared on the same slice.
- `system.*`: generated values such as `system.uuid`, `system.now`, and build metadata.
- `session.*`: authenticated/session context declared at a Phoenix boundary.
- `trigger.*`: fields from the event or condition that started an automation.
- `external.*`: fields from an external boundary event declared by a translation.
- `read_model.*`: fields returned by declared read-model queries.
- `aggregate.*`: aggregate state fields declared in `aggregate.state`.
- `computed.*`: deterministic outputs declared in the same slice.
- `command.*`: fields from the command declared in the same state-change slice.
- `command_caller.*`: metadata about the authenticated command caller.
- `event.*`: fields from a projected event inside `projects_from` mappings.
- `projection.*`: deterministic projection-local outputs.
- `component.*`: props/slots from declared component references.
- `memory.*`: structured memory records declared by memory slices.
- `vector.<MemoryName>.search`: vector memory retrieval evidence.
- `artifact.*`: bounded artifact metadata or content references.
- `literal.<value>`: literal/default value where the value is safe to store in the
  model.

Every command field, event field, translated command field, component prop,
automation dispatch field, memory field, and read-model projection field must declare
a source unless it is a primary key/default declaration whose generation is already
specified.

Forbidden sources:

- raw secret values, API keys, bearer tokens, cookies, private keys, or credentials;
- provider raw responses as authoritative state before structured validation;
- undeclared ad hoc map paths;
- LLM chain-of-thought or hidden reasoning fields.

## Aggregate State Evolution

Aggregate state evolution is the contract that allows strict validation of
`aggregate.*` references and write-side invariants.

Each aggregate state field declares:

```yaml
aggregate:
  state:
    status:
      type: string
      established_by: DefectFiled.status
      updated_by:
        - DefectResolved.status
        - DefectReopened.status
      used_by:
        - invariant.reject_duplicate_resolution
```

Rules:

- `established_by` references an event emitted by the same aggregate stream before the
  state field can be read.
- `updated_by` lists every event that mutates the state field.
- Invariant sources using `aggregate.*` must be listed in state evolution.
- State fields are not read from projections for aggregate decisions.
- Stream identity must remain stable across all commands that share the aggregate.

## Scenario Schema

Scenarios are executable examples for validators and future test generation.

GWT write-side scenario:

```yaml
scenarios:
  rejects_duplicate_resolution:
    given:
      - DefectFiled{defect_id: "d1"}
      - DefectResolved{defect_id: "d1"}
    when: ResolveDefect{defect_id: "d1"}
    then:
      - error.already_resolved
```

GT projection/automation/translation scenario:

```yaml
scenarios:
  projects_timeline_entry:
    given:
      - DefectFiled{defect_id: "d1"}
    then:
      - read_model.DefectTimeline{defect_id: "d1"}
```

Rules:

- `given` references known events, external events, read models, memory records, or
  component registry facts.
- `when` references a known command for GWT scenarios.
- `then` references known events, commands, read-model facts, component render facts,
  memory facts, PubSub/status facts, or explicit expected errors.
- Scenario names describe the observable behavior under test.
- Scenarios include enough field values for strict source and type validation.

## Component References

Component references appear in screens, design-system slices, and component props.

```yaml
screen:
  components:
    - component: DefectTimeline
      props:
        events: read_model.DefectTimeline.events
```

Rules:

- References must resolve to a `design_system` slice or a component registry entry
  declared as existing external baseline.
- Props supplied by screens must match the component prop contract.
- Missing required accessibility attributes fail validation.
- New component proposals include registry search evidence and reuse/evolution
  decision notes.

## Memory References

Memory references appear in context assembly, learning extraction, component lookup,
and retrieval automations.

```yaml
reads:
  - vector: PatternMemory
    query: computed.prompt_context_query
    limit: 5
    filters:
      classification: internal
```

Rules:

- Vector memory references name a declared memory slice or approved external baseline.
- Retrieval queries declare query source, limit, filters, returned fields, sensitivity
  policy, and inclusion reason.
- Prompt context includes source traceability, rank/score, token estimate, sensitivity
  classification, and redaction status for each memory result.

## Event Compatibility Rules

Events are durable contracts. Model patches must preserve replay unless they explicitly
model compatibility handling.

Allowed without versioning:

- adding optional event fields with defaults or tolerant serializers;
- adding new events;
- adding new projections that read existing events;
- adding read-model fields sourced from existing event data or safe defaults.

Requires explicit new event version and compatibility plan:

- renaming an event;
- deleting an event;
- removing a field;
- changing field type incompatibly;
- tightening requiredness for historical payloads;
- changing semantic meaning of an existing field;
- changing stream identity for existing aggregate history.

Compatibility plans declare:

```yaml
event_compatibility:
  changes:
    - from: ModelPatchProposed.v1
      to: ModelPatchProposed.v2
      reason: Add normalized diff summary.
      upcaster: Anything.EventUpcasters.ModelPatchProposedV2
      projections_checked:
        - ModelPatchReview
```

Rules:

- Historical replay must continue through upcasters or version-aware handlers.
- Projectors and process managers affected by event changes are listed and tested.
- Compatibility declarations are part of strict completeness validation.

## LLM Invocation Completeness

LLM-related slices additionally declare:

- purpose: `model_patch`, `model_patch_repair`, `code_generation`, `code_repair`,
  `component_selection`, or `learning_extraction`;
- provider policy reference with no raw secrets;
- prompt template name and version;
- required/optional context sections;
- output schema name and version;
- redaction policy;
- timeout, token budget, streaming mode, and retry budget;
- idempotency key;
- raw prompt/response retention policy and artifact sensitivity classification;
- invalid-output repair or terminal blocked path.

Structured outputs reject forbidden fields such as `chain_of_thought`, `secrets`, and
undeclared provider-specific payloads.

## Completeness Error Shape

Strict validation errors must be actionable and stable:

```yaml
error:
  type: command_field_source_missing
  slice: file_defect
  path: command.fields.description.source
  offending_reference: screen.description
  remediation: Declare screen.inputs.description or change the field source.
```

Each error includes `type`, `slice`, `path`, `offending_reference` when applicable,
and `remediation`.
