"use client";

import { useEffect, useState } from "react";
import type { Run, RunStep, EvaluationResult, RunStatus } from "@/lib/types";

type RunEvent =
  | { kind: "step"; step: RunStep }
  | { kind: "status"; status: RunStatus; error?: string }
  | { kind: "artifact"; name: string }
  | { kind: "evaluation"; evaluation: EvaluationResult }
  | { kind: "done" };

export function useRunStream(runId: string): { run: Run | null; connected: boolean } {
  const [run, setRun] = useState<Run | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/runs/${runId}/stream`);

    source.addEventListener("snapshot", (e) => {
      setRun(JSON.parse((e as MessageEvent).data) as Run);
      setConnected(true);
    });

    source.addEventListener("event", (e) => {
      const evt = JSON.parse((e as MessageEvent).data) as RunEvent;
      setRun((prev) => {
        if (!prev) return prev;
        const next: Run = { ...prev, steps: [...prev.steps], artifacts: [...prev.artifacts] };
        switch (evt.kind) {
          case "step":
            next.steps.push(evt.step);
            break;
          case "status":
            next.status = evt.status;
            if (evt.error) next.error = evt.error;
            break;
          case "artifact":
            if (!next.artifacts.some((a) => a.name === evt.name)) {
              next.artifacts.push({ name: evt.name, contentType: "application/octet-stream", sizeBytes: 0 });
            }
            break;
          case "evaluation":
            next.evaluation = evt.evaluation;
            break;
          case "done":
            break;
        }
        return next;
      });
    });

    source.addEventListener("done", () => {
      source.close();
      setConnected(false);
    });

    source.onerror = () => {
      // On error, fall back to a one-shot state fetch so the UI isn't stuck.
      setConnected(false);
      source.close();
      fetch(`/api/runs/${runId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setRun(data as Run))
        .catch(() => {});
    };

    return () => source.close();
  }, [runId]);

  return { run, connected };
}
