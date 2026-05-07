#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const validator = path.join(root, "scripts", "check_event_model_completeness.mjs");

function withTempEventModel(files, assertion) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-model-contract-"));

  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tempDir, name), content);
    }

    const result = spawnSync(process.execPath, [validator, tempDir], {
      cwd: root,
      encoding: "utf8"
    });

    assertion(result);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function parseErrors(result) {
  let errors;
  assert.doesNotThrow(() => {
    errors = JSON.parse(result.stderr);
  }, `expected validator stderr to be JSON errors, got:\n${result.stderr}`);
  return errors;
}

function assertValidatorRejected(result, message) {
  assert.notEqual(
    result.status,
    0,
    `${message}, but it exited 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function assertErrorsMention(errors, requiredTerms) {
  const errorText = JSON.stringify(errors);

  for (const required of requiredTerms) {
    assert.match(
      errorText,
      new RegExp(required.replaceAll(".", "\\.")),
      `expected validation errors to mention ${required}; errors were:\n${JSON.stringify(errors, null, 2)}`
    );
  }
}

withTempEventModel(
  {
    "missing_single_aggregate_mapping_contract.yaml":
      `slice: missing_single_aggregate_mapping_contract\n` +
      `type: state_change\n` +
      `workflow: contract_test\n` +
      `summary: Missing single aggregate-per-command ownership metadata must be rejected.\n` +
      `owners:\n` +
      `  context: Anything.ContractTest\n` +
      `command:\n` +
      `  name: RetryExternalProviderRequest\n` +
      `  fields:\n` +
      `    request_id: {type: uuid, source: system.uuid}\n` +
      `    external_request_id: {type: uuid, source: external.request_id}\n` +
      `events:\n` +
      `  - name: ExternalProviderRetryRequested\n` +
      `    version: 1\n` +
      `    fields:\n` +
      `      request_id: {type: uuid, source: command.request_id}\n` +
      `      external_request_id: {type: uuid, source: command.external_request_id}\n` +
      `scenarios:\n` +
      `  main_success:\n` +
      `    given: []\n` +
      `    when: 'RetryExternalProviderRequest{request_id: req-1}'\n` +
      `    then: ['ExternalProviderRetryRequested{request_id: req-1}']\n`
  },
  (result) => {
    assertValidatorRejected(
      result,
      "expected validator to reject missing single aggregate-per-command ownership metadata"
    );

    assertErrorsMention(parseErrors(result), [
      "command.module",
      "aggregate.module",
      "aggregate.name",
      "aggregate.stream_id",
      "aggregate.prefix",
      "aggregate.pattern",
      "router.registration",
      "command_self_registers",
      "router.middleware",
      "validate_command",
      "authorize_command",
      "router.lifespan",
      "router.command_idempotency_key"
    ]);
  }
);

withTempEventModel(
  {
    "wrong_middleware_order.yaml":
      `slice: wrong_middleware_order\n` +
      `type: state_change\n` +
      `workflow: contract_test\n` +
      `summary: validate_command must run before authorize_command for command ownership validation.\n` +
      `owners:\n` +
      `  context: Anything.ContractTest\n` +
      `command:\n` +
      `  name: RetryExternalProviderRequest\n` +
      `  module: Anything.ContractTest.Commands.RetryExternalProviderRequest\n` +
      `  fields:\n` +
      `    request_id: {type: uuid, source: system.uuid}\n` +
      `    external_request_id: {type: uuid, source: external.request_id}\n` +
      `aggregate:\n` +
      `  name: external_provider_retry_request\n` +
      `  module: Anything.ContractTest.Aggregates.ExternalProviderRetryRequest\n` +
      `  stream_id: request_id\n` +
      `  prefix: external_provider_retry\n` +
      `  pattern: single_aggregate_per_command\n` +
      `  state:\n` +
      `    retry_requested: {type: boolean, established_by: {ExternalProviderRetryRequested: true}}\n` +
      `router:\n` +
      `  registration: command_self_registers\n` +
      `  middleware: [authorize_command, validate_command]\n` +
      `  lifespan: stop_after_command_event_or_error\n` +
      `  command_idempotency_key: request_id\n` +
      `events:\n` +
      `  - name: ExternalProviderRetryRequested\n` +
      `    version: 1\n` +
      `    fields:\n` +
      `      request_id: {type: uuid, source: command.request_id}\n` +
      `      external_request_id: {type: uuid, source: command.external_request_id}\n` +
      `scenarios:\n` +
      `  main_success:\n` +
      `    given: []\n` +
      `    when: 'RetryExternalProviderRequest{request_id: req-1}'\n` +
      `    then: ['ExternalProviderRetryRequested{request_id: req-1}']\n`
  },
  (result) => {
    assertValidatorRejected(
      result,
      "expected validator to reject authorize_command before validate_command middleware ordering"
    );

    assertErrorsMention(parseErrors(result), [
      "router.middleware",
      "validate_command",
      "authorize_command"
    ]);
  }
);
