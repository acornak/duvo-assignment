import path from "node:path";
import type { RunRepository } from "./run-repository";
import type { ArtifactStore } from "./artifact-store";
import { InMemoryRunRepository } from "./in-memory-run-repository";
import { LocalArtifactStore } from "./local-artifact-store";

// Singletons survive across requests in a single Node server process.
// Stash on globalThis so Next.js dev hot-reload doesn't create duplicates.
const g = globalThis as unknown as {
  __runRepository?: RunRepository;
  __artifactStore?: ArtifactStore;
};

export function getRunRepository(): RunRepository {
  if (!g.__runRepository) g.__runRepository = new InMemoryRunRepository();
  return g.__runRepository;
}

export function getArtifactStore(): ArtifactStore {
  if (!g.__artifactStore) {
    const baseDir = path.resolve(process.env.RUN_DATA_DIR ?? ".run-data");
    g.__artifactStore = new LocalArtifactStore(baseDir);
  }
  return g.__artifactStore;
}

export type { RunRepository } from "./run-repository";
export type { ArtifactStore } from "./artifact-store";
