defmodule AnythingWeb.PageController do
  use AnythingWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
