import type { RunStep, Run, EvaluationResult } from "@/lib/types";

export type RunEvent =
  | { kind: "step"; step: RunStep }
  | { kind: "status"; status: Run["status"]; error?: string }
  | { kind: "artifact"; name: string }
  | { kind: "evaluation"; evaluation: EvaluationResult }
  | { kind: "done" };

type Listener = (e: RunEvent) => void;

export class RunBus {
  private listeners = new Map<string, Set<Listener>>();

  publish(runId: string, event: RunEvent): void {
    const set = this.listeners.get(runId);
    if (!set) return;
    for (const l of set) {
      try {
        l(event);
      } catch {
        // a failing listener must not break the publisher
      }
    }
  }

  subscribe(runId: string, listener: Listener): () => void {
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(runId);
    };
  }
}

const g = globalThis as unknown as { __runBus?: RunBus };

export function getRunBus(): RunBus {
  if (!g.__runBus) g.__runBus = new RunBus();
  return g.__runBus;
}
