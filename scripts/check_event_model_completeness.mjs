#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "yaml";

const root = process.argv[2] ?? "event_model/workflows/bootstrap";
const allowedSystemPrefixes = ["system", "system.", "literal", "literal.", "command_caller", "command_caller."];

function readSlices(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      const data = parse(fs.readFileSync(file, "utf8"));
      return { ...data, __file: file, name: data.slice };
    });
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function entries(object) {
  return Object.entries(object ?? {});
}

function hasPath(object, dotted) {
  if (!object || !dotted) return false;
  return dotted.split(".").every((part, index, parts) => {
    if (object == null || typeof object !== "object" || !(part in object)) return false;
    object = object[part];
    return index < parts.length;
  });
}

function refName(text) {
  if (typeof text !== "string") return null;
  const match = text.match(/^([A-Za-z0-9_.]+)\{/);
  return match?.[1] ?? text;
}

function eventNames(slices) {
  return new Set(slices.flatMap((slice) => asArray(slice.events).map((event) => event.name).filter(Boolean)));
}

function commandNames(slices) {
  const names = new Set();
  for (const slice of slices) {
    if (slice.command?.name) names.add(slice.command.name);
    for (const command of asArray(slice.commands)) {
      if (command.name) names.add(command.name);
    }
  }
  return names;
}

function readModelNames(slices) {
  return new Set(slices.map((slice) => slice.read_model?.name).filter(Boolean));
}

function commandFieldMap(slice) {
  return slice.command?.fields ?? {};
}

function eventFieldMapByName(slices) {
  const map = new Map();
  for (const slice of slices) {
    for (const event of asArray(slice.events)) {
      if (event.name) map.set(event.name, event.fields ?? {});
    }
  }
  return map;
}

function screenInputs(slice) {
  return slice.screen?.inputs ?? {};
}

function aggregateState(slice) {
  return slice.aggregate?.state ?? {};
}

function knownComputed(slice) {
  return new Set(entries(slice.computed).map(([name]) => name));
}

function validateSource(errors, slice, kind, field, source, context = {}) {
  if (source == null) {
    errors.push({ type: `${kind}_source_missing`, slice: slice.name, file: slice.__file, field, reason: "source is absent" });
    return;
  }

  if (typeof source !== "string") return;
  if (allowedSystemPrefixes.some((prefix) => source === prefix || source.startsWith(prefix))) return;

  if (source.startsWith("screen.")) {
    const input = source.slice("screen.".length);
    if (!screenInputs(slice)[input]) {
      errors.push({ type: `${kind}_source_missing`, slice: slice.name, file: slice.__file, field, source, reason: `screen has no input named ${input}` });
    }
    return;
  }

  if (source.startsWith("command.")) {
    const cmdField = source.slice("command.".length);
    if (!commandFieldMap(slice)[cmdField]) {
      errors.push({ type: `${kind}_source_missing`, slice: slice.name, file: slice.__file, field, source, reason: `command has no field named ${cmdField}` });
    }
    return;
  }

  if (source.startsWith("aggregate.")) {
    const aggField = source.slice("aggregate.".length);
    const state = aggregateState(slice)[aggField];
    if (!state?.established_by && !state?.updated_by) {
      errors.push({ type: `${kind}_source_missing`, slice: slice.name, file: slice.__file, field, source, reason: `aggregate field ${aggField} is not established` });
    }
    return;
  }

  if (source.startsWith("computed.")) {
    const computedField = source.slice("computed.".length).split(".")[0];
    if (!knownComputed(slice).has(computedField) && !context.allowExternalComputed) {
      errors.push({ type: `${kind}_source_missing`, slice: slice.name, file: slice.__file, field, source, reason: `computed output ${computedField} is not declared` });
    }
    return;
  }

  if (source.startsWith("trigger.")) return;
  if (source.startsWith("external.")) return;
  if (source.startsWith("read_model.")) return;
  if (source.startsWith("vector.")) return;
  if (source.startsWith("artifact.")) return;

  errors.push({ type: `${kind}_source_unknown_namespace`, slice: slice.name, file: slice.__file, field, source, reason: "source namespace is not recognized" });
}

function checkCommandFieldSources(slices, errors) {
  for (const slice of slices.filter((s) => s.type === "state_change")) {
    for (const [field, spec] of entries(commandFieldMap(slice))) {
      validateSource(errors, slice, "command", field, spec?.source, { allowExternalComputed: true });
    }
  }
}

function checkEventFieldSources(slices, errors) {
  for (const slice of slices.filter((s) => s.type === "state_change")) {
    for (const event of asArray(slice.events)) {
      for (const [field, spec] of entries(event.fields)) {
        if (field === "<<") continue;
        validateSource(errors, slice, "event", `${event.name}.${field}`, spec?.source, { allowExternalComputed: true });
      }
    }
  }
}

function checkReadModelFieldSources(slices, errors) {
  for (const slice of slices.filter((s) => s.read_model)) {
    for (const [field, spec] of entries(slice.read_model.fields)) {
      if (spec?.pk || spec?.default !== undefined || spec?.source) continue;
      const populated = asArray(slice.projects_from).some((projection) => projection.map && Object.prototype.hasOwnProperty.call(projection.map, field));
      if (!populated) {
        errors.push({ type: "read_model_field_unsourced", slice: slice.name, file: slice.__file, field });
      }
    }
  }
}

function checkDispatches(slices, errors) {
  const commands = commandNames(slices);
  const requiredFieldsByCommand = new Map();
  for (const slice of slices.filter((s) => s.type === "state_change" && s.command?.name)) {
    requiredFieldsByCommand.set(slice.command.name, Object.keys(slice.command.fields ?? {}).filter((field) => !slice.command.fields[field]?.optional && !["recorded_at", "requested_at", "received_at", "validated_at", "checked_at", "applied_at", "decided_at", "reviewed_at", "filed_at", "blocked_at"].includes(field)));
    for (const alias of asArray(slice.commands)) requiredFieldsByCommand.set(alias.name, requiredFieldsByCommand.get(slice.command.name));
  }

  for (const slice of slices) {
    for (const dispatch of asArray(slice.dispatches)) {
      if (!dispatch.command || dispatch.command === "none") continue;
      if (!commands.has(dispatch.command)) {
        errors.push({ type: "dispatch_references_unknown_command", slice: slice.name, file: slice.__file, command: dispatch.command });
        continue;
      }
      const supplied = new Set(Object.keys(dispatch.fields ?? {}));
      for (const field of requiredFieldsByCommand.get(dispatch.command) ?? []) {
        if (!supplied.has(field) && !field.endsWith("_id")) {
          errors.push({ type: "dispatch_missing_command_field", slice: slice.name, file: slice.__file, command: dispatch.command, field });
        }
      }
    }

    const translated = slice.translates_to?.command;
    if (translated && translated !== "none" && !commands.has(translated)) {
      errors.push({ type: "translation_references_unknown_command", slice: slice.name, file: slice.__file, command: translated });
    }
  }
}

function checkReferenceIntegrity(slices, errors) {
  const events = eventNames(slices);
  const commands = commandNames(slices);
  const readModels = readModelNames(slices);

  for (const slice of slices) {
    for (const projection of asArray(slice.projects_from)) {
      if (projection.event && !events.has(projection.event) && !projection.event.endsWith("Defined") && projection.event !== "EventModelInitialized") {
        errors.push({ type: "projection_references_unknown_event", slice: slice.name, file: slice.__file, event: projection.event });
      }
    }
    for (const read of asArray(slice.reads)) {
      if (read.read_model && !readModels.has(read.read_model)) {
        errors.push({ type: "read_references_unknown_read_model", slice: slice.name, file: slice.__file, read_model: read.read_model });
      }
    }
    for (const scenario of Object.values(slice.scenarios ?? {})) {
      for (const given of asArray(scenario.given)) {
        const name = refName(given);
        if (name && !events.has(name) && !name.startsWith("external.") && !name.endsWith("Defined") && !["EventModelInitialized", "ComponentRegistrySearched", "PubSubStatusUpdated"].includes(name)) {
          errors.push({ type: "scenario_given_unknown_event", slice: slice.name, file: slice.__file, event: name });
        }
      }
      const whenName = refName(scenario.when);
      if (whenName && !commands.has(whenName)) {
        errors.push({ type: "scenario_when_unknown_command", slice: slice.name, file: slice.__file, command: whenName });
      }
      for (const then of asArray(scenario.then)) {
        if (typeof then !== "string") continue;
        const name = refName(then);
        if (name && !events.has(name) && !commands.has(name) && !name.startsWith("external.") && !["PubSubStatusUpdated"].includes(name)) {
          errors.push({ type: "scenario_then_unknown_reference", slice: slice.name, file: slice.__file, reference: name });
        }
      }
    }
  }
}

function checkAggregateConsistency(slices, errors) {
  const groups = new Map();
  for (const slice of slices.filter((s) => s.aggregate?.name)) {
    const group = groups.get(slice.aggregate.name) ?? [];
    group.push(slice);
    groups.set(slice.aggregate.name, group);
  }
  for (const [aggregate, group] of groups) {
    const streamIds = new Set(group.map((s) => s.aggregate.stream_id));
    if (streamIds.size > 1) {
      errors.push({ type: "aggregate_stream_id_conflict", aggregate, slices: group.map((s) => s.name), stream_ids: [...streamIds] });
    }
  }
}

function checkSingleAggregateCommandOwnership(slices, errors) {
  for (const slice of slices.filter((s) => s.type === "state_change" && s.command)) {
    for (const [path, value] of [
      ["command.module", slice.command.module],
      ["aggregate.module", slice.aggregate?.module],
      ["aggregate.name", slice.aggregate?.name],
      ["aggregate.stream_id", slice.aggregate?.stream_id],
      ["aggregate.prefix", slice.aggregate?.prefix],
      ["router.lifespan", slice.router?.lifespan]
    ]) {
      if (!value) {
        errors.push({ type: "single_aggregate_command_metadata_missing", slice: slice.name, file: slice.__file, path });
      }
    }

    if (slice.aggregate?.pattern !== "single_aggregate_per_command") {
      errors.push({ type: "single_aggregate_command_metadata_invalid", slice: slice.name, file: slice.__file, path: "aggregate.pattern", expected: "single_aggregate_per_command" });
    }

    if (slice.router?.registration !== "command_self_registers") {
      errors.push({ type: "single_aggregate_command_metadata_invalid", slice: slice.name, file: slice.__file, path: "router.registration", expected: "command_self_registers" });
    }

    const middleware = asArray(slice.router?.middleware);
    const validateIndex = middleware.indexOf("validate_command");
    const authorizeIndex = middleware.indexOf("authorize_command");
    if (validateIndex === -1 || authorizeIndex === -1 || authorizeIndex < validateIndex) {
      errors.push({ type: "single_aggregate_command_metadata_invalid", slice: slice.name, file: slice.__file, path: "router.middleware", expected: ["validate_command", "authorize_command"] });
    }

    const usesExternalInput = entries(commandFieldMap(slice)).some(([, spec]) => typeof spec?.source === "string" && spec.source.startsWith("external."));
    if (usesExternalInput && !slice.router?.command_idempotency_key) {
      errors.push({ type: "single_aggregate_command_metadata_missing", slice: slice.name, file: slice.__file, path: "router.command_idempotency_key" });
    }
  }
}

function main() {
  const slices = readSlices(root);
  const errors = [];
  checkCommandFieldSources(slices, errors);
  checkEventFieldSources(slices, errors);
  checkReadModelFieldSources(slices, errors);
  checkDispatches(slices, errors);
  checkReferenceIntegrity(slices, errors);
  checkAggregateConsistency(slices, errors);
  checkSingleAggregateCommandOwnership(slices, errors);

  if (errors.length === 0) {
    console.log(`ok - ${slices.length} slices checked`);
    return;
  }

  console.error(JSON.stringify(errors, null, 2));
  process.exitCode = 1;
}

main();
