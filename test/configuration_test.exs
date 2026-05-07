defmodule Anything.ConfigurationTest do
  use ExUnit.Case, async: true

  @config_dir Path.expand("../config", __DIR__)

  test "configuration is centralized in config.exs and runtime.exs" do
    config_files =
      @config_dir
      |> Path.join("*.exs")
      |> Path.wildcard()
      |> Enum.map(&Path.basename/1)
      |> Enum.sort()

    assert config_files == ["config.exs", "runtime.exs"]

    config_exs = File.read!(Path.join(@config_dir, "config.exs"))

    refute config_exs =~ ~r/import_config\s+["']#\{config_env\(\)\}\.exs/
  end

  test "centralized config preserves Ecto task visibility and explicit runtime env" do
    config_exs = File.read!(Path.join(@config_dir, "config.exs"))
    runtime_exs = File.read!(Path.join(@config_dir, "runtime.exs"))

    assert runtime_exs =~ ~S|ConfigHelper.get_env("PORT", "4000", :int)|

    assert config_exs =~ """
           if config_env() == :dev do
             config :anything, Anything.Repo,
           """

    assert config_exs =~ """
           if config_env() == :test do
             config :anything, Anything.Repo,
           """

    refute runtime_exs =~ """
           if config_env() in [:dev, :test] do
             config :anything, Anything.Repo,
           """

    refute runtime_exs =~ """
           if config_env() == :dev do
             config :anything, Anything.Repo,
           """

    refute runtime_exs =~ """
           if config_env() == :test do
             config :anything, Anything.Repo,
           """

    assert runtime_exs =~ ~s'''
             database_url =
               ConfigHelper.get_env("DATABASE_URL") ||
                 raise """
                 environment variable DATABASE_URL is missing.
                 For example: ecto://USER:PASS@HOST/DATABASE
                 """
           '''

    assert runtime_exs =~ ~s'''
             secret_key_base =
               ConfigHelper.get_env("SECRET_KEY_BASE") ||
                 raise """
                 environment variable SECRET_KEY_BASE is missing.
                 You can generate one by calling: mix phx.gen.secret
                 """
           '''
  end
end
