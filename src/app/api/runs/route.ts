import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRunRepository } from "@/lib/storage";
import { getConnectionRegistry } from "@/lib/connections";
import { getRunBus } from "@/lib/events/run-bus";
import { startRun } from "@/lib/agent/agent-runner";
import { evaluateRun } from "@/lib/evaluation/evaluator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { prompt?: string; connectionIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const repo = getRunRepository();
  const registry = getConnectionRegistry();
  const bus = getRunBus();

  // Only honor connection ids that exist AND are enabled in the registry.
  const requested = Array.isArray(body.connectionIds) ? body.connectionIds : [];
  const connectionsEnabled = registry
    .list()
    .filter((c) => c.enabled && requested.includes(c.id))
    .map((c) => c.id);

  const runId = randomUUID();
  repo.createRun({ id: runId, prompt, connectionsEnabled });

  // Fire and forget: run the agent, then evaluate, then signal done.
  void (async () => {
    try {
      await startRun(runId);
      const run = repo.getRun(runId);
      if (run && run.status === "completed") {
        await evaluateRun(runId);
      }
    } catch {
      // startRun already records failure; nothing else to do here.
    } finally {
      bus.publish(runId, { kind: "done" });
    }
  })();

  return NextResponse.json({ runId }, { status: 201 });
}

export async function GET() {
  const repo = getRunRepository();
  return NextResponse.json({ runs: repo.listRuns() });
}
