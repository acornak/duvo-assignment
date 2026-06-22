import type { Run, RunStep, RunStatus, EvaluationResult, ArtifactRef } from "@/lib/types";
import type { CreateRunInput, RunRepository } from "./run-repository";

export class InMemoryRunRepository implements RunRepository {
  private runs = new Map<string, Run>();
  private order: string[] = []; // insertion order, oldest first

  createRun(input: CreateRunInput): Run {
    const now = new Date().toISOString();
    const run: Run = {
      id: input.id,
      prompt: input.prompt,
      status: "queued",
      connectionsEnabled: input.connectionsEnabled,
      steps: [],
      artifacts: [],
      startedAt: now,
    };
    this.runs.set(run.id, run);
    this.order.push(run.id);
    return run;
  }

  getRun(id: string): Run | undefined {
    return this.runs.get(id);
  }

  listRuns(): Run[] {
    return [...this.order].reverse().map((id) => this.runs.get(id)!).filter(Boolean);
  }

  appendStep(id: string, step: Omit<RunStep, "seq" | "at">): RunStep {
    const run = this.mustGet(id);
    const full: RunStep = { ...step, seq: run.steps.length, at: new Date().toISOString() };
    run.steps.push(full);
    return full;
  }

  setStatus(id: string, status: RunStatus, error?: string): void {
    const run = this.mustGet(id);
    run.status = status;
    if (error !== undefined) run.error = error;
    if (status === "completed" || status === "failed") {
      run.finishedAt = new Date().toISOString();
    }
  }

  addArtifact(id: string, artifact: ArtifactRef): void {
    const run = this.mustGet(id);
    if (!run.artifacts.some((a) => a.name === artifact.name)) {
      run.artifacts.push(artifact);
    }
  }

  setEvaluation(id: string, evaluation: EvaluationResult): void {
    this.mustGet(id).evaluation = evaluation;
  }

  private mustGet(id: string): Run {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run not found: ${id}`);
    return run;
  }
}
