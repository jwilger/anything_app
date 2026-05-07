import type { Plugin } from "@kilocode/plugin";
import { sessionContext } from "./lib/shared.ts";

export const PhoenixCommandedContextPlugin: Plugin = async () => ({
  "experimental.session.compacting": async (input, output) => {
    const context = sessionContext(input.sessionID);
    if (context.length) {
      output.context.push("Phoenix/Commanded project context:", ...context);
    }
  },
  "tool.execute.after": async (input, output) => {
    if (/rgr_|forgejo_/i.test(input.tool)) {
      output.metadata = { ...(output.metadata ?? {}), phoenixCommandedContextPreserved: true };
    }
  },
});

export default PhoenixCommandedContextPlugin;
