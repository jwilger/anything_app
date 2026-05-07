# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :anything,
  ecto_repos: [Anything.Repo],
  generators: [timestamp_type: :utc_datetime]

# Configure the endpoint
config :anything, AnythingWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: AnythingWeb.ErrorHTML, json: AnythingWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Anything.PubSub,
  live_view: [signing_salt: "C0W/lrTK"]

# Configure the mailer
#
# By default it uses the "Local" adapter which stores the emails
# locally. You can see the emails in your browser, at "/dev/mailbox".
#
# For production it's recommended to configure a different adapter
# at the `config/runtime.exs`.
config :anything, Anything.Mailer, adapter: Swoosh.Adapters.Local

# Configure esbuild (the version is required)
config :esbuild,
  version: "0.25.4",
  anything: [
    args:
      ~w(js/app.js --bundle --target=es2022 --outdir=../priv/static/assets/js --external:/fonts/* --external:/images/* --alias:@=.),
    cd: Path.expand("../assets", __DIR__),
    env: %{
      "NODE_PATH" => [
        System.get_env("MIX_DEPS_PATH", Path.expand("../deps", __DIR__)),
        Mix.Project.build_path()
      ]
    }
  ]

# Configure tailwind (the version is required)
config :tailwind,
  version: "4.1.12",
  anything: [
    args: ~w(
      --input=assets/css/app.css
      --output=priv/static/assets/css/app.css
    ),
    cd: Path.expand("..", __DIR__)
  ]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

if config_env() == :dev do
  config :anything, Anything.Repo,
    username: System.get_env("PGUSER", "anything"),
    password: System.get_env("PGPASSWORD", "postgres"),
    hostname: System.get_env("PGHOST", "127.0.0.1"),
    port: String.to_integer(System.get_env("PGPORT", "55432")),
    database: System.get_env("PGDATABASE", "anything_dev"),
    stacktrace: true,
    show_sensitive_data_on_connection_error: true,
    pool_size: 10

  # For development, we disable any cache and enable
  # debugging and code reloading.
  #
  # The watchers configuration can be used to run external
  # watchers to your application. For example, we can use it
  # to bundle .js and .css sources.
  config :anything, AnythingWeb.Endpoint,
    # Binding to loopback ipv4 address prevents access from other machines.
    # Change to `ip: {0, 0, 0, 0}` to allow access from other machines.
    http: [ip: {127, 0, 0, 1}],
    check_origin: false,
    code_reloader: true,
    debug_errors: true,
    secret_key_base: "SV0bzV/qnOrKjLWg6aNRJ2L1TO0xX8F5W9IEyKTRBzH6fWa+ia4TlybR9JC39Fvs",
    watchers: [
      esbuild: {Esbuild, :install_and_run, [:anything, ~w(--sourcemap=inline --watch)]},
      tailwind: {Tailwind, :install_and_run, [:anything, ~w(--watch)]}
    ]

  # Reload browser tabs when matching files change.
  config :anything, AnythingWeb.Endpoint,
    live_reload: [
      web_console_logger: true,
      patterns: [
        # Static assets, except user uploads
        ~r"priv/static/(?!uploads/).*\.(js|css|png|jpeg|jpg|gif|svg)$",
        # Gettext translations
        ~r"priv/gettext/.*\.po$",
        # Router, Controllers, LiveViews and LiveComponents
        ~r"lib/anything_web/router\.ex$",
        ~r"lib/anything_web/(controllers|live|components)/.*\.(ex|heex)$"
      ]
    ]

  # Enable dev routes for dashboard and mailbox
  config :anything, dev_routes: true

  # Do not include metadata nor timestamps in development logs
  config :logger, :default_formatter, format: "[$level] $message\n"

  # Set a higher stacktrace during development. Avoid configuring such
  # in production as building large stacktraces may be expensive.
  config :phoenix, :stacktrace_depth, 20

  # Initialize plugs at runtime for faster development compilation
  config :phoenix, :plug_init_mode, :runtime

  config :phoenix_live_view,
    # Include debug annotations and locations in rendered markup.
    # Changing this configuration will require mix clean and a full recompile.
    debug_heex_annotations: true,
    debug_attributes: true,
    # Enable helpful, but potentially expensive runtime checks
    enable_expensive_runtime_checks: true

  # Disable swoosh api client as it is only required for production adapters.
  config :swoosh, :api_client, false
end

if config_env() == :test do
  config :anything, Anything.Repo,
    username: System.get_env("PGUSER", "anything"),
    password: System.get_env("PGPASSWORD", "postgres"),
    hostname: System.get_env("PGHOST", "127.0.0.1"),
    port: String.to_integer(System.get_env("PGPORT", "55432")),
    database: "anything_test#{System.get_env("MIX_TEST_PARTITION")}",
    pool: Ecto.Adapters.SQL.Sandbox,
    pool_size: System.schedulers_online() * 2

  # The MIX_TEST_PARTITION environment variable can be used
  # to provide built-in test partitioning in CI environment.
  # Run `mix help test` for more information.

  # We don't run a server during test. If one is required,
  # you can enable the server option below.
  config :anything, AnythingWeb.Endpoint,
    http: [ip: {127, 0, 0, 1}, port: 4002],
    secret_key_base: "NUc7YLu+STfKPka6z3MZ8CG4PhK6MfPwzMBzmGMfNOBKMNQOZ0wd7mXhADQMcrRG",
    server: false

  # In test we don't send emails
  config :anything, Anything.Mailer, adapter: Swoosh.Adapters.Test

  # Disable swoosh api client as it is only required for production adapters
  config :swoosh, :api_client, false

  # Print only warnings and errors during test
  config :logger, level: :warning

  # Initialize plugs at runtime for faster test compilation
  config :phoenix, :plug_init_mode, :runtime

  # Enable helpful, but potentially expensive runtime checks
  config :phoenix_live_view,
    enable_expensive_runtime_checks: true

  # Sort query params output of verified routes for robust url comparisons
  config :phoenix,
    sort_verified_routes_query_params: true
end

if config_env() == :prod do
  # Note we also include the path to a cache manifest
  # containing the digested version of static files. This
  # manifest is generated by the `mix assets.deploy` task,
  # which you should run after static files are built and
  # before starting your production server.
  config :anything, AnythingWeb.Endpoint, cache_static_manifest: "priv/static/cache_manifest.json"

  # Force using SSL in production. This also sets the "strict-security-transport" header,
  # known as HSTS. If you have a health check endpoint, you may want to exclude it below.
  # Note `:force_ssl` is required to be set at compile-time.
  config :anything, AnythingWeb.Endpoint,
    force_ssl: [
      rewrite_on: [:x_forwarded_proto],
      exclude: [
        # paths: ["/health"],
        hosts: ["localhost", "127.0.0.1"]
      ]
    ]

  # Configure Swoosh API Client
  config :swoosh, api_client: Swoosh.ApiClient.Req

  # Disable Swoosh Local Memory Storage
  config :swoosh, local: false

  # Do not print debug messages in production
  config :logger, level: :info
end
