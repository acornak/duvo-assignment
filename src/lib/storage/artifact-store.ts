import type { ArtifactRef } from "@/lib/types";

export interface ArtifactStore {
  /** Absolute path to the per-run working directory the agent writes into. */
  runDir(runId: string): string;
  /** Ensure the run dir exists. */
  ensureRunDir(runId: string): Promise<string>;
  /** Stat a file the agent wrote and return its ref (or undefined if missing). */
  register(runId: string, fileName: string): Promise<ArtifactRef | undefined>;
  /** Read an artifact's bytes + ref. */
  read(runId: string, fileName: string): Promise<{ data: Buffer; ref: ArtifactRef } | undefined>;
  /** List candidate output file names in the run dir (non-recursive). */
  listFiles(runId: string): Promise<string[]>;
}
