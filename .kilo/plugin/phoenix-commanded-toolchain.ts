import type { Plugin } from "@kilocode/plugin";
import { blocksUnsafeToolchainCommand, commandText } from "./lib/shared.ts";

export const PhoenixCommandedToolchainPlugin: Plugin = async ({ worktree }) => ({
  "shell.env": async (_input, output) => {
    output.env.MIX_HOME = `${worktree}/.dependencies/mix`;
    output.env.HEX_HOME = `${worktree}/.dependencies/hex`;
    output.env.REBAR_CACHE_DIR = `${worktree}/.dependencies/rebar3`;
    output.env.npm_config_cache = `${worktree}/.dependencies/npm`;
  },
  "tool.execute.before": async (input, output) => {
    if (/bash$/i.test(input.tool) && blocksUnsafeToolchainCommand(commandText(output.args))) {
      throw new Error("Phoenix/Commanded toolchain gate blocked a command that bypasses project-local tooling, scope hygiene, hooks, signing, or git safety.");
    }
  },
});

export default PhoenixCommandedToolchainPlugin;
