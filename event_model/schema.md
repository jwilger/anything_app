# Event Model Schema

## Terms

- `bootstrap workflow package`: the first runnable set of event-modeled slices for the meta-app workflow.
- `slice`: one event-modeled vertical unit, such as a state change, state view, automation, translation, design-system entry, or memory flow.
- `strict information completeness`: deterministic validation that every modeled attribute, scenario reference, UI binding, aggregate state reference, automation dispatch field, and read-model field traces to a declared upstream source.

## Common Fields

Every slice declares:

```yaml
slice: file_defect
type: state_change
workflow: bootstrap
summary: User files the next defect to drive app evolution.
owners:
  context: Anything.Defects
  web: AnythingWeb.DefectConsoleLive
```

## Slice Types

- `state_change`: command, aggregate, router metadata, events, and GWT scenarios.
- `state_view`: read model, projection mappings, screen bindings, and GT scenarios.
- `automation`: trigger, reads, computed outputs, dispatches, retry/idempotency, and scenarios.
- `translation`: external event shape, translated command fields, boundary metadata, and scenarios.
- `design_system`: component registry entry, props, slots, composition, accessibility contract, and search metadata.
- `memory`: vector/read memory entry, source event/artifact, embedding metadata, retention, sensitivity, and retrieval queries.

## Source Syntax

Allowed source namespaces are `screen.*`, `system.*`, `session.*`, `trigger.*`, `external.*`, `read_model.*`, `aggregate.*`, `computed.*`, `command.*`, `command_caller.*`, vector memory references such as `vector.PatternMemory.search`, and literal values.

Every command field, event field, translated command field, component prop, automation dispatch field, and read-model projection field must declare a source unless it is a read-model primary key/default declaration.

## State-Change Contract

State-change slices must declare command and aggregate metadata so command ownership is deterministic.

Required fields:

- `command.name`
- `command.module`
- `command.fields` with explicit field sources
- `aggregate.name`
- `aggregate.stream_id`
- `aggregate.prefix`
- `aggregate.pattern: single_aggregate_per_command`
- `aggregate.state` with `established_by` and, when applicable, `updated_by`
- `router.registration: command_self_registers`
- `router.middleware: [validate_command, authorize_command]`
- `router.lifespan: stop_after_command_event_or_error`
- `events`
- `router.command_idempotency_key` when retries or external calls can duplicate dispatch
- at least one `main_success` scenario and validation/invariant scenarios for required fields

When a slice models multiple command forms, it must list each command while preserving the same command module and aggregate contract.

## State-View Contract

State-view slices declare a `read_model`, projection mappings in `projects_from`, query/screen bindings where applicable, and GT scenarios. Every read model field must be populated by a projection mapping, literal/default, or computed query expression. Update and delete projections require identity/where mappings.

## Automation Contract

Automation slices declare an event or condition trigger, read-model/vector/artifact reads, computed outputs, dispatches, retry policy, idempotency key, duplicate handling, and scenarios.

## Translation Contract

Translation slices declare the external boundary, external event shape, idempotency key, failure handling, translated command, field source mapping, and scenarios.

## LLM Invocation Contract

LLM invocation slices declare purpose, provider policy, prompt template version, output schema, context package source, streaming mode, retry policy, redaction policy, timeout, token budget, idempotency key, and raw response retention policy.

Structured outputs must reject forbidden fields such as `chain_of_thought` and `secrets`. Invalid output has a modeled repair or terminal blocked path.

## Component Contract

Components declare Atomic Design level, purpose, props, slots, composed-from dependencies, accessibility contract, and daisyUI/Tailwind usage rules. New component creation requires registry search evidence.

## Memory Contract

Memory entries declare source event/artifact, classification, embedding model, retention policy, sensitivity policy, and retrieval query rules. Vector search results are prompt evidence, not authoritative business state.

## Event Compatibility

Existing event names cannot be renamed or deleted by a model patch. Existing event fields cannot be removed, have requiredness tightened, or receive incompatible type changes. Additive optional fields are allowed when projections and serializers tolerate them. Breaking shape changes require a new event version and declared upcaster/compatibility plan.

## Completeness Errors

Strict validation errors must include slice, path, offending reference, and remediation hint.
