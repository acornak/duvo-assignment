import type { ConnectionRegistry } from "./connection-registry";
import { InMemoryConnectionRegistry } from "./in-memory-connection-registry";

const g = globalThis as unknown as { __connectionRegistry?: ConnectionRegistry };

export function getConnectionRegistry(): ConnectionRegistry {
  if (!g.__connectionRegistry) g.__connectionRegistry = new InMemoryConnectionRegistry();
  return g.__connectionRegistry;
}

export type { ConnectionRegistry, ConnectionPatch } from "./connection-registry";
