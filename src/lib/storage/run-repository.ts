import type { Run, RunStep, RunStatus, EvaluationResult, ArtifactRef } from "@/lib/types";

export interface CreateRunInput {
  id: string;
  prompt: string;
  connectionsEnabled: string[];
}

export interface RunRepository {
  createRun(input: CreateRunInput): Run;
  getRun(id: string): Run | undefined;
  listRuns(): Run[]; // newest first
  appendStep(id: string, step: Omit<RunStep, "seq" | "at">): RunStep;
  setStatus(id: string, status: RunStatus, error?: string): void;
  addArtifact(id: string, artifact: ArtifactRef): void;
  setEvaluation(id: string, evaluation: EvaluationResult): void;
}
