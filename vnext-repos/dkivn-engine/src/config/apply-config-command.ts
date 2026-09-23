import type { ControlCommand } from "@dkivn/contracts";
import type { DispatchResult } from "../control/control-server.js";
import { RuntimeConfigStore } from "./runtime-config-store.js";

export interface ConnectionIdentity {
  publicWsConnectionId: string;
  privateWsConnectionId: string;
}

export async function applyConfigCommand(
  command: Extract<ControlCommand, { type: "APPLY_CONFIG" }>,
  store: RuntimeConfigStore,
  _connections: Readonly<ConnectionIdentity>,
): Promise<DispatchResult> {
  if (command.generation !== command.config.generation) {
    throw new Error("CONFIG_GENERATION_MISMATCH");
  }

  const result = store.apply(command.config);
  if (!result.ok) {
    throw new Error(result.code);
  }

  return { code: "CONFIG_APPLIED" };
}

export function createEngineControlDispatcher(options: {
  configStore: RuntimeConfigStore;
  connections: Readonly<ConnectionIdentity>;
  fallback?: (command: Exclude<ControlCommand, { type: "APPLY_CONFIG" }>) => Promise<DispatchResult>;
}) {
  return async (command: ControlCommand): Promise<DispatchResult> => {
    if (command.type === "APPLY_CONFIG") {
      return applyConfigCommand(command, options.configStore, options.connections);
    }
    if (options.fallback) {
      return options.fallback(command);
    }
    return { code: "COMMAND_ACCEPTED_NOOP" };
  };
}
