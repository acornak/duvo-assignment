import { getRunRepository, getArtifactStore } from "@/lib/storage";
import { getRunBus } from "@/lib/events/run-bus";
import type { EvaluationResult, DeterministicCheck } from "@/lib/types";
import { runDeterministicChecks } from "./deterministic";
import { judge } from "./judge";

const PREVIEW_BYTES = 6000;

export async function evaluateRun(runId: string): Promise<EvaluationResult> {
  const repo = getRunRepository();
  const artifacts = getArtifactStore();
  const bus = getRunBus();

  const run = repo.getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);

  const primary = run.artifacts[0];
  const checks: DeterministicCheck[] = [];
  const judgeReasons: string[] = [];
  let score = 0;

  if (!primary) {
    checks.push({ name: "artifact-exists", passed: false, detail: "no output artifact was produced" });
  } else {
    checks.push({ name: "artifact-exists", passed: true, detail: primary.name });
    const read = await artifacts.read(runId, primary.name);
    const content = read ? read.data.toString("utf8") : "";
    checks.push(...runDeterministicChecks(primary.name, content));

    const deterministicPassed = checks.every((c) => c.passed);
    if (deterministicPassed) {
      try {
        const j = await judge({
          prompt: run.prompt,
          artifactName: primary.name,
          artifactPreview: content.slice(0, PREVIEW_BYTES),
        });
        score = j.score;
        judgeReasons.push(...j.reasons);
      } catch (err) {
        judgeReasons.push(
          `LLM judge could not run: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      judgeReasons.push("Skipped LLM judge because deterministic checks failed.");
    }
  }

  const deterministicPassed = checks.every((c) => c.passed);
  const verdict: EvaluationResult["verdict"] =
    deterministicPassed && score >= 0.6 ? "pass" : "fail";

  const result: EvaluationResult = {
    verdict,
    score,
    deterministicChecks: checks,
    judgeReasons,
    at: new Date().toISOString(),
  };

  repo.setEvaluation(runId, result);
  bus.publish(runId, { kind: "evaluation", evaluation: result });
  return result;
}
