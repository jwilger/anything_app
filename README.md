# Anything

Anything is a Phoenix 1.8 application for building a defect-driven, self-evolving application workflow. The user describes what is not working through a chat/defect console; the system records that defect, updates an event model first, validates the model for strict information completeness, generates code from validated model changes, runs test/compile gates, safely loads accepted changes, and asks for the next defect.

The application is intended to be event-sourced and observable: Commanded owns write-side decisions and durable workflow history, Postgres stores events/read models/vector memory, Phoenix LiveView provides the primary UI, and deterministic validators keep LLM-assisted model/code changes behind explicit checks.

## Current baseline

This branch establishes the runnable Phoenix baseline:

- Phoenix 1.8 with LiveView and Postgres.
- Tailwind 4 and daisyUI asset defaults.
- Centralized configuration in `config/config.exs` and `config/runtime.exs`.
- Environment-driven runtime settings suitable for 12-factor deployment.
- Initial threat-model documentation for the Phoenix/Postgres baseline.

## Local setup

Start the local Postgres service, then install and prepare dependencies:

```sh
mix setup
```

Start Phoenix with:

```sh
mix phx.server
```

or inside IEx:

```sh
iex -S mix phx.server
```

Visit [`localhost:4000`](http://localhost:4000) from your browser.

## Configuration

Development and test database settings default to the repository Compose Postgres service and can be overridden with standard Postgres environment variables:

- `PGUSER` (default: `anything`)
- `PGPASSWORD` (default: `postgres`)
- `PGHOST` (default: `127.0.0.1`)
- `PGPORT` (default: `55432`)
- `PGDATABASE` for development (default: `anything_dev`)

Production requires `DATABASE_URL` and `SECRET_KEY_BASE`. Optional runtime settings include `PORT`, `PHX_HOST`, `POOL_SIZE`, `ECTO_IPV6`, `DNS_CLUSTER_QUERY`, and `PHX_SERVER`.

## Verification

Useful baseline checks:

```sh
mix format --check-formatted
MIX_ENV=test mix compile --warnings-as-errors --force
mix test --warnings-as-errors
```
