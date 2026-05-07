---
description: Run focused or full Phoenix/Elixir verification.
agent: phoenix-commanded-implementer
---

Verify the current work: $ARGUMENTS

Prefer focused checks first, then broader gates as needed. If the Phoenix app, Mix project, or Nix flake does not exist yet, verify only the configuration and plugin files that are present and do not create project setup files as part of verification.

```sh
mix test path/to/file_test.exs:line
mix format --check-formatted
MIX_ENV=test mix compile --warnings-as-errors --force
MIX_ENV=prod mix compile --warnings-as-errors --force
mix test --warnings-as-errors
mix dialyzer --halt-exit-status
mix credo --strict
mix sobelow
```

Run Dialyzer as a required full gate once the Mix project exists. Run Credo, Sobelow, asset, database, and release checks when configured or when the change affects those surfaces. State any skipped gate and why.
