{
  description = "Development environment for the Anything Phoenix 1.8 application";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        beamPackages = pkgs.beam.packagesWith pkgs.erlang;
      in
      {
        devShells.default = pkgs.mkShell {
          name = "anything-app-devshell";

          packages = with pkgs; [
            beamPackages.elixir
            erlang
            beamPackages.rebar3
            nodejs_latest
            postgresql_18
            docker-client
            docker-compose
            git
            gnumake
            gcc
            inotify-tools
            openssl
            pkg-config
            cacert
          ];

          shellHook = ''
            export MIX_HOME="$PWD/.dependencies/mix"
            export HEX_HOME="$PWD/.dependencies/hex"
            export MIX_ARCHIVES="$MIX_HOME/archives"
            export MIX_DEPS_PATH="$PWD/.dependencies/deps"
            export MIX_BUILD_PATH="$PWD/.dependencies/build"
            export npm_config_cache="$PWD/.dependencies/npm"

            export PGHOST="127.0.0.1"
            export PGPORT="55432"
            export PGUSER="anything"
            export PGPASSWORD="postgres"
            export PGDATABASE="anything_dev"
            export DATABASE_URL="postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE"

            export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
            export GIT_SSL_CAINFO="$SSL_CERT_FILE"

            mkdir -p \
              "$MIX_HOME" \
              "$HEX_HOME" \
              "$MIX_ARCHIVES" \
              "$MIX_DEPS_PATH" \
              "$MIX_BUILD_PATH" \
              "$npm_config_cache" \
              "$PWD/.dependencies/docker/cli-plugins"

            if [ -z "$DOCKER_CONFIG" ]; then
              export DOCKER_CONFIG="$PWD/.dependencies/docker"
            fi

            ln -sf "${pkgs.docker-compose}/bin/docker-compose" \
              "$PWD/.dependencies/docker/cli-plugins/docker-compose"

            mix local.hex --force --if-missing >/dev/null
            mix local.rebar --force --if-missing >/dev/null

            if ! mix help phx.new >/dev/null 2>&1; then
              mix archive.install hex phx_new --force
            fi

            printf '%s\n' \
              'Anything dev shell ready.' \
              '  Phoenix generator: mix phx.new --version' \
              '  Postgres: docker compose up -d postgres' \
              "  Database URL: $DATABASE_URL"
          '';
        };
      }
    );
}
