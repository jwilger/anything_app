# AGENTS.md

## Project

This repository is configured for a greenfield Phoenix 1.8 application using Postgres and Commanded. Keep guidance idiomatic to Elixir, Phoenix, Ecto, and event-sourced write models rather than translating older repository assumptions mechanically.

## Architecture

- Keep Phoenix routes, controllers, LiveViews, components, and channels thin. Delegate application behavior to Phoenix contexts.
- Use contexts as the public application API and as the boundary between web concerns, persistence concerns, and Commanded write-side behavior.
- Use Ecto schemas, changesets, migrations, constraints, and indexes for Postgres persistence and read models. Enforce invariants at the database boundary when data integrity depends on them.
- Use Commanded commands, events, aggregates, process managers, projectors, and handlers for write-side decisions and event-sourced workflows.
- Keep command authorization explicit before dispatch. Do not hide authorization inside unrelated handlers or projectors.
- Treat events as durable contracts. Prefer additive payload changes, version events when shape changes, and add upcasters or compatibility handling before breaking historical replay.
- Make handlers, projectors, and process managers idempotent. Assume retries, duplicate messages, partially applied projections, and replay.
- Keep read-model ownership clear. Ecto read models support queries and UI; Commanded aggregates own write-side invariants and decision history.
- Avoid speculative behaviours, macros, umbrella boundaries, services, or generic abstractions. Introduce seams when tests or concrete reuse demand them.

## Elixir Style

- Prefer small functions, clear pipelines, pattern matching, tagged tuples, and changesets over broad conditionals or ad hoc maps.
- Return `{:ok, value}` and `{:error, reason}` for expected outcomes. Reserve exceptions for truly exceptional or framework-conventional failures.
- Keep processes supervision-friendly. Use OTP supervisors, GenServers, Oban/jobs, PubSub, and Commanded infrastructure intentionally rather than ad hoc state.
- Write typespecs for public context APIs, commands, events, behaviours, and data structures when they improve Dialyzer coverage and caller clarity.
- Do not casually suppress Dialyzer warnings. Prefer clearer types, narrower returns, and explicit guards.

## Testing

- Production Elixir/Phoenix/Commanded behavior requires observed failing ExUnit evidence before production edits.
- Prefer focused tests first: context tests, aggregate/command tests, projection tests, `DataCase`, `ConnCase`, LiveView tests, and targeted regression tests.
- Use factories/fixtures that express domain intent. Avoid coupling tests to unrelated implementation details.
- For database behavior, exercise migrations, constraints, indexes, and transactions where the behavior depends on Postgres semantics.

## Verification

- Start with the focused `mix test` command that proves the current behavior or regression.
- Use `MIX_ENV=test` for test setup, migrations, and compilation when the database is involved.
- Run `mix format --check-formatted` before handoff.
- Compile both test and prod code with warnings as errors: `MIX_ENV=test mix compile --warnings-as-errors --force` and `MIX_ENV=prod mix compile --warnings-as-errors --force`.
- Run the broader test suite with warnings as errors: `mix test --warnings-as-errors`.
- Treat Dialyzer as a required full gate once the Mix project exists: `mix dialyzer --halt-exit-status`.
- Run configured static and security checks such as `mix credo --strict` and `mix sobelow` when those tools are present.
- State any skipped gate and the concrete reason, especially when the Phoenix app, Mix project, or Nix flake has not been created yet. Do not create those setup files during unrelated Kilo configuration work.
