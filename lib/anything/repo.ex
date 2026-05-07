defmodule Anything.Repo do
  use Ecto.Repo,
    otp_app: :anything,
    adapter: Ecto.Adapters.Postgres
end
