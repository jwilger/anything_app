# Toolchain

Use the project-pinned Elixir, Erlang, Node, and Postgres tooling when the project defines it through Nix, mise, asdf, devbox, containers, or another checked-in mechanism. Do not invent a toolchain manager for the greenfield app; if no pin exists yet, use ordinary `mix`, `elixir`, `npm`, and Postgres commands available in the environment.

If the Phoenix app, Mix project, or Nix flake has not been created yet, treat those toolchain gates as unavailable rather than generating setup files during unrelated Kilo configuration work.

Do not install global toolchains, global Mix archives, or global Node packages unless the user explicitly asks for that machine-level change. Keep caches project-local under `.dependencies/` when configured, and set `MIX_ENV` per command instead of globally.
