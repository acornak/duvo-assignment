export type RunStatus = "queued" | "running" | "completed" | "failed";

export type RunStepType =
  | "assistant_text"
  | "tool_use"
  | "tool_result"
  | "mcp_call"
  | "error"
  | "result";

export type StepStatus = "ok" | "error" | "pending";

export interface RunStep {
  seq: number;
  type: RunStepType;
  title: string;
  detail?: string;
  toolName?: string;
  status: StepStatus;
  at: string; // ISO timestamp
}

export interface ArtifactRef {
  name: string; // file name, e.g. "ai-news.csv"
  contentType: string; // e.g. "text/csv"
  sizeBytes: number;
}

export interface DeterministicCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface EvaluationResult {
  verdict: "pass" | "fail";
  score: number; // 0..1
  deterministicChecks: DeterministicCheck[];
  judgeReasons: string[];
  at: string; // ISO timestamp
}

export interface Run {
  id: string;
  prompt: string;
  status: RunStatus;
  connectionsEnabled: string[]; // connection ids active for this run
  steps: RunStep[];
  artifacts: ArtifactRef[];
  evaluation?: EvaluationResult;
  error?: string;
  startedAt: string; // ISO
  finishedAt?: string; // ISO
}

export type ConnectionType = "notion";

export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  enabled: boolean;
  // Notion settings:
  token?: string;
  parentPageId?: string;
}

// A connection as exposed to the client — secrets redacted.
export interface ConnectionPublic {
  id: string;
  name: string;
  type: ConnectionType;
  enabled: boolean;
  configured: boolean; // token + parentPageId both present
  parentPageId?: string;
}
