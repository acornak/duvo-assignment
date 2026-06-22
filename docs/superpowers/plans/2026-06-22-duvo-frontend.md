# duvo.ai Agentic Automation Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight Next.js web app where a user sends a single instruction to a Claude-Agent-SDK-powered agent, watches the automation unfold step-by-step over SSE, downloads the output artifact (a CSV), optionally lets the agent write a summary to Notion via an enable/disable MCP connection, and sees an automatic hybrid (rule + LLM-judge) evaluation of the result.

**Architecture:** Single Next.js (App Router, TypeScript) app. Route handlers run the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) and normalize its message stream into typed `RunStep`s, which are persisted to an in-memory repository and pushed to the browser over Server-Sent Events. All state lives behind storage/connection interfaces so Postgres + a real file/blob store can be plugged in later. Evaluation uses the Anthropic Messages SDK (`@anthropic-ai/sdk`) as an LLM judge plus deterministic CSV checks.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, `@anthropic-ai/claude-agent-sdk` (agent loop + MCP), `@anthropic-ai/sdk` (LLM judge), `@notionhq/notion-mcp-server` (stdio MCP, launched via `npx`). No database. No test suite (deferred per project decision).

## Global Constraints

- **Language/runtime:** TypeScript, Next.js App Router, Node.js runtime for all route handlers (never the Edge runtime — the Agent SDK spawns child processes). Every API route file must export `export const runtime = 'nodejs'`.
- **Agent model:** Default `claude-opus-4-8`, overridable via `process.env.AGENT_MODEL`. Never hardcode a different model.
- **Judge model:** `claude-opus-4-8` via `@anthropic-ai/sdk` Messages API, overridable via `process.env.JUDGE_MODEL`.
- **No tests now:** Each task's cycle is implement → typecheck/build → commit. Do NOT write a test suite. (Testing is explicitly deferred; revisit only if asked.)
- **Storage is swappable:** All run/artifact/connection access goes through the interfaces in `src/lib/storage` and `src/lib/connections`. Never reach around them with module-global mutable state outside those files.
- **Secrets:** `ANTHROPIC_API_KEY` and Notion token come from environment / connection settings. Never hardcode or log secrets.
- **Frequent commits:** One commit per task, message prefixed `feat:` / `chore:`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `next-env.d.ts`
- Create: `.gitignore`
- Create: `.env.local.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx` (placeholder, replaced in Task 12)
- Create: `src/app/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable Next.js app; `npm run dev` serves a page; `npm run build` succeeds.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "duvo-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@anthropic-ai/sdk": "^0.70.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created; a `package-lock.json` is written. If the exact versions above 404, install the latest of each instead: `npm install @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk next react react-dom` and `npm install -D typescript @types/node @types/react @types/react-dom`, then re-pin `package.json` to whatever resolved. Confirm `@anthropic-ai/claude-agent-sdk` exists in `node_modules`.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Agent SDK and Notion MCP server are spawned as child processes at
  // runtime; keep them external so Next doesn't try to bundle them.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
```

- [ ] **Step 5: Create `next-env.d.ts`**

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
.next/
.env.local
.run-data/
*.log
```

- [ ] **Step 7: Create `.env.local.example`**

```
# Required: Anthropic API key for the Agent SDK and the LLM judge
ANTHROPIC_API_KEY=sk-ant-...

# Optional model overrides
AGENT_MODEL=claude-opus-4-8
JUDGE_MODEL=claude-opus-4-8

# Optional: default Notion connection settings (can also be set in the UI)
NOTION_TOKEN=
NOTION_PARENT_PAGE_ID=

# Where artifacts and per-run working dirs are written
RUN_DATA_DIR=.run-data
```

- [ ] **Step 8: Create `src/app/globals.css`**

```css
:root {
  --bg: #0f1115;
  --panel: #1a1d24;
  --border: #2a2f3a;
  --text: #e6e8ec;
  --muted: #8b92a0;
  --accent: #5b8cff;
  --green: #3fb950;
  --red: #f85149;
  --amber: #d29922;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
}
a { color: var(--accent); }
button { font-family: inherit; }
```

- [ ] **Step 9: Create `src/app/layout.tsx`**

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "duvo.ai — Automation",
  description: "Lightweight agentic automation frontend",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Create placeholder `src/app/page.tsx`**

```tsx
export default function Home() {
  return <main style={{ padding: 24 }}>duvo.ai automation — scaffold OK</main>;
}
```

- [ ] **Step 11: Typecheck and build**

Run: `npm run build`
Expected: build completes with no type errors; output shows a route for `/`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app"
```

---

### Task 2: Shared types

**Files:**
- Create: `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical types used everywhere downstream. Exact names below are relied on by every later task — do not rename.

- [ ] **Step 1: Create `src/lib/types.ts`**

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: shared domain types"
```

---

### Task 3: Storage layer (run repository + artifact store)

**Files:**
- Create: `src/lib/storage/run-repository.ts`
- Create: `src/lib/storage/in-memory-run-repository.ts`
- Create: `src/lib/storage/artifact-store.ts`
- Create: `src/lib/storage/local-artifact-store.ts`
- Create: `src/lib/storage/index.ts`

**Interfaces:**
- Consumes: `Run`, `RunStep`, `RunStatus`, `EvaluationResult`, `ArtifactRef` from `@/lib/types`.
- Produces:
  - `RunRepository` interface with: `createRun(input: { id: string; prompt: string; connectionsEnabled: string[] }): Run`, `getRun(id: string): Run | undefined`, `listRuns(): Run[]` (newest first), `appendStep(id: string, step: Omit<RunStep, "seq" | "at">): RunStep`, `setStatus(id: string, status: RunStatus, error?: string): void`, `addArtifact(id: string, artifact: ArtifactRef): void`, `setEvaluation(id: string, evaluation: EvaluationResult): void`.
  - `ArtifactStore` interface with: `runDir(runId: string): string`, `register(runId: string, fileName: string): Promise<ArtifactRef>`, `read(runId: string, fileName: string): Promise<{ data: Buffer; ref: ArtifactRef } | undefined>`.
  - `getRunRepository(): RunRepository` and `getArtifactStore(): ArtifactStore` singletons from `index.ts`.

- [ ] **Step 1: Create `src/lib/storage/run-repository.ts`**

```typescript
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
```

- [ ] **Step 2: Create `src/lib/storage/in-memory-run-repository.ts`**

```typescript
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
```

- [ ] **Step 3: Create `src/lib/storage/artifact-store.ts`**

```typescript
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
```

- [ ] **Step 4: Create `src/lib/storage/local-artifact-store.ts`**

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ArtifactRef } from "@/lib/types";
import type { ArtifactStore } from "./artifact-store";

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith(".csv")) return "text/csv";
  if (fileName.endsWith(".json")) return "application/json";
  if (fileName.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

export class LocalArtifactStore implements ArtifactStore {
  constructor(private baseDir: string) {}

  runDir(runId: string): string {
    return path.join(this.baseDir, runId);
  }

  async ensureRunDir(runId: string): Promise<string> {
    const dir = this.runDir(runId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  private safeJoin(runId: string, fileName: string): string {
    const base = path.basename(fileName); // strip any path components
    return path.join(this.runDir(runId), base);
  }

  async register(runId: string, fileName: string): Promise<ArtifactRef | undefined> {
    const full = this.safeJoin(runId, fileName);
    try {
      const stat = await fs.stat(full);
      const name = path.basename(full);
      return { name, contentType: contentTypeFor(name), sizeBytes: stat.size };
    } catch {
      return undefined;
    }
  }

  async read(
    runId: string,
    fileName: string,
  ): Promise<{ data: Buffer; ref: ArtifactRef } | undefined> {
    const full = this.safeJoin(runId, fileName);
    try {
      const data = await fs.readFile(full);
      const name = path.basename(full);
      return {
        data,
        ref: { name, contentType: contentTypeFor(name), sizeBytes: data.byteLength },
      };
    } catch {
      return undefined;
    }
  }

  async listFiles(runId: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.runDir(runId), { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 5: Create `src/lib/storage/index.ts`**

```typescript
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
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: in-memory run repository and local artifact store behind interfaces"
```

---

### Task 4: Connection registry

**Files:**
- Create: `src/lib/connections/connection-registry.ts`
- Create: `src/lib/connections/in-memory-connection-registry.ts`
- Create: `src/lib/connections/index.ts`

**Interfaces:**
- Consumes: `Connection`, `ConnectionPublic` from `@/lib/types`.
- Produces:
  - `ConnectionRegistry` interface: `list(): Connection[]`, `get(id: string): Connection | undefined`, `update(id: string, patch: Partial<Pick<Connection, "enabled" | "token" | "parentPageId">>): Connection`, `toPublic(c: Connection): ConnectionPublic`.
  - `getConnectionRegistry(): ConnectionRegistry` singleton.
  - The registry seeds a single Notion connection with id `"notion"`, pre-filled from `NOTION_TOKEN` / `NOTION_PARENT_PAGE_ID` env vars if present, `enabled: false` by default.

- [ ] **Step 1: Create `src/lib/connections/connection-registry.ts`**

```typescript
import type { Connection, ConnectionPublic } from "@/lib/types";

export type ConnectionPatch = Partial<Pick<Connection, "enabled" | "token" | "parentPageId">>;

export interface ConnectionRegistry {
  list(): Connection[];
  get(id: string): Connection | undefined;
  update(id: string, patch: ConnectionPatch): Connection;
  toPublic(c: Connection): ConnectionPublic;
}
```

- [ ] **Step 2: Create `src/lib/connections/in-memory-connection-registry.ts`**

```typescript
import type { Connection, ConnectionPublic } from "@/lib/types";
import type { ConnectionPatch, ConnectionRegistry } from "./connection-registry";

export class InMemoryConnectionRegistry implements ConnectionRegistry {
  private connections = new Map<string, Connection>();

  constructor() {
    this.connections.set("notion", {
      id: "notion",
      name: "Notion",
      type: "notion",
      enabled: false,
      token: process.env.NOTION_TOKEN || undefined,
      parentPageId: process.env.NOTION_PARENT_PAGE_ID || undefined,
    });
  }

  list(): Connection[] {
    return [...this.connections.values()];
  }

  get(id: string): Connection | undefined {
    return this.connections.get(id);
  }

  update(id: string, patch: ConnectionPatch): Connection {
    const c = this.connections.get(id);
    if (!c) throw new Error(`Connection not found: ${id}`);
    const next: Connection = { ...c, ...patch };
    this.connections.set(id, next);
    return next;
  }

  toPublic(c: Connection): ConnectionPublic {
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      enabled: c.enabled,
      configured: Boolean(c.token && c.parentPageId),
      parentPageId: c.parentPageId,
    };
  }
}
```

- [ ] **Step 3: Create `src/lib/connections/index.ts`**

```typescript
import type { ConnectionRegistry } from "./connection-registry";
import { InMemoryConnectionRegistry } from "./in-memory-connection-registry";

const g = globalThis as unknown as { __connectionRegistry?: ConnectionRegistry };

export function getConnectionRegistry(): ConnectionRegistry {
  if (!g.__connectionRegistry) g.__connectionRegistry = new InMemoryConnectionRegistry();
  return g.__connectionRegistry;
}

export type { ConnectionRegistry, ConnectionPatch } from "./connection-registry";
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: in-memory MCP connection registry (Notion)"
```

---

### Task 5: Run event bus (SSE pub/sub)

**Files:**
- Create: `src/lib/events/run-bus.ts`

**Interfaces:**
- Consumes: `RunStep`, `Run`, `EvaluationResult` from `@/lib/types`.
- Produces:
  - Type `RunEvent =
      | { kind: "step"; step: RunStep }
      | { kind: "status"; status: Run["status"]; error?: string }
      | { kind: "artifact"; name: string }
      | { kind: "evaluation"; evaluation: EvaluationResult }
      | { kind: "done" }`.
  - `getRunBus(): RunBus` singleton, where `RunBus` has `publish(runId: string, event: RunEvent): void` and `subscribe(runId: string, listener: (e: RunEvent) => void): () => void` (returns an unsubscribe fn).

- [ ] **Step 1: Create `src/lib/events/run-bus.ts`**

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: in-memory run event bus for SSE fan-out"
```

---

### Task 6: SDK message normalizer

**Files:**
- Create: `src/lib/agent/normalizer.ts`

**Interfaces:**
- Consumes: `RunStep` from `@/lib/types`. Consumes Agent SDK message objects (typed loosely as `unknown`-ish records below to avoid coupling to the SDK's exact exported types, which may drift).
- Produces: `normalizeMessage(message: AgentSdkMessage): Omit<RunStep, "seq" | "at">[]` — maps one SDK message to zero or more steps. Also exports the loose `AgentSdkMessage` type alias used by the runner.

**Background (verified against `@anthropic-ai/claude-agent-sdk` docs):** `query()` yields messages with a `type` field. Relevant shapes:
- `{ type: "assistant", message: { content: ContentBlock[] } }` where a block is `{ type: "text", text }` or `{ type: "tool_use", id, name, input }`.
- `{ type: "user", message: { content: ... } }` carrying `tool_result` blocks (`{ type: "tool_result", tool_use_id, content, is_error? }`); `content` may also be a plain string.
- `{ type: "result", subtype, is_error, result?, num_turns, total_cost_usd }`.
- MCP tool calls appear as `tool_use` blocks whose `name` starts with `mcp__` (e.g. `mcp__notion__...`).

- [ ] **Step 1: Create `src/lib/agent/normalizer.ts`**

```typescript
import type { RunStep } from "@/lib/types";

// Loose structural types — the Agent SDK's exact exported types may drift, so we
// read defensively and only depend on the fields the docs guarantee.
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: string; [k: string]: unknown };

export interface AgentSdkMessage {
  type: string;
  message?: { content?: ContentBlock[] | string };
  subtype?: string;
  is_error?: boolean;
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  [k: string]: unknown;
}

type NewStep = Omit<RunStep, "seq" | "at">;

function truncate(s: string, max = 4000): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === "object" && "text" in c) return String((c as { text: unknown }).text);
        return JSON.stringify(c);
      })
      .join("\n");
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function blocks(message: AgentSdkMessage): ContentBlock[] {
  const c = message.message?.content;
  if (Array.isArray(c)) return c;
  return [];
}

export function normalizeMessage(message: AgentSdkMessage): NewStep[] {
  const steps: NewStep[] = [];

  if (message.type === "assistant") {
    for (const block of blocks(message)) {
      if (block.type === "text") {
        const text = String((block as { text?: unknown }).text ?? "").trim();
        if (text) {
          steps.push({ type: "assistant_text", title: "Assistant", detail: truncate(text), status: "ok" });
        }
      } else if (block.type === "tool_use") {
        const name = String((block as { name?: unknown }).name ?? "tool");
        const input = (block as { input?: unknown }).input;
        const isMcp = name.startsWith("mcp__");
        steps.push({
          type: isMcp ? "mcp_call" : "tool_use",
          title: isMcp ? `Connection · ${name.replace(/^mcp__/, "")}` : `Tool · ${name}`,
          detail: truncate(stringifyContent(input)),
          toolName: name,
          status: "pending",
        });
      }
    }
    return steps;
  }

  if (message.type === "user") {
    for (const block of blocks(message)) {
      if (block.type === "tool_result") {
        const isError = Boolean((block as { is_error?: unknown }).is_error);
        const content = (block as { content?: unknown }).content;
        steps.push({
          type: "tool_result",
          title: isError ? "Tool result (error)" : "Tool result",
          detail: truncate(stringifyContent(content)),
          status: isError ? "error" : "ok",
        });
      }
    }
    return steps;
  }

  if (message.type === "result") {
    const isError = Boolean(message.is_error) || (message.subtype && message.subtype !== "success");
    steps.push({
      type: "result",
      title: isError ? "Run finished with error" : "Run finished",
      detail: truncate(
        [
          message.result ? `Result: ${message.result}` : undefined,
          typeof message.num_turns === "number" ? `Turns: ${message.num_turns}` : undefined,
          typeof message.total_cost_usd === "number"
            ? `Cost: $${message.total_cost_usd.toFixed(4)}`
            : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      status: isError ? "error" : "ok",
    });
    return steps;
  }

  // Other message types (system init, partial, status, progress) are not surfaced.
  return steps;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: normalize Agent SDK messages into typed run steps"
```

---

### Task 7: Agent runner

**Files:**
- Create: `src/lib/agent/prompts.ts`
- Create: `src/lib/agent/agent-runner.ts`

**Interfaces:**
- Consumes: `getRunRepository`, `getArtifactStore` from `@/lib/storage`; `getConnectionRegistry` from `@/lib/connections`; `getRunBus` from `@/lib/events/run-bus`; `normalizeMessage`, `AgentSdkMessage` from `./normalizer`; `query` from `@anthropic-ai/claude-agent-sdk`; `Connection` from `@/lib/types`.
- Produces: `startRun(runId: string): Promise<void>` — runs the agent for an already-created `Run`, streaming steps to repo + bus, registering artifacts, flipping status, and (in Task 8 wiring) leaving evaluation to be triggered by the caller. Also exports `buildSystemPrompt(connections: Connection[]): string`.

**Notes:**
- Use `permissionMode: "bypassPermissions"` so the headless run never blocks on a permission prompt.
- Set `cwd` to the run's working dir so the agent's `Write` lands there.
- Attach the Notion MCP server only when its connection is enabled AND configured (token + parentPageId).
- After the agent finishes, register every file found in the run dir as an artifact and publish an `artifact` event for each.

- [ ] **Step 1: Create `src/lib/agent/prompts.ts`**

```typescript
import type { Connection } from "@/lib/types";

export function buildSystemPrompt(connections: Connection[]): string {
  const notion = connections.find((c) => c.id === "notion" && c.enabled);
  const lines: string[] = [
    "You are an automation agent for the duvo.ai platform.",
    "You complete the user's task end-to-end using your available tools.",
    "When the task asks you to save data to a file, ALWAYS write the file into the current working directory using the Write tool. Use a clear file name (e.g. ai-news.csv).",
    "For CSV output: include a header row and one row per record. Quote fields containing commas.",
    "Work autonomously: do not ask the user questions; make reasonable choices and proceed.",
    "Keep your text responses concise — they are shown live as the steps of the automation.",
  ];
  if (notion) {
    lines.push(
      "",
      "A Notion connection is ENABLED. After producing the primary output, create a NEW Notion page that summarizes the results.",
      `Use the Notion MCP tools to create the page under the parent page id "${notion.parentPageId}".`,
      "Title the page exactly with the run id provided in the task, and put a concise summary of the results in the page body.",
    );
  } else {
    lines.push(
      "",
      "No Notion connection is enabled, so do NOT attempt to write to Notion. Skip any Notion step.",
    );
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: Create `src/lib/agent/agent-runner.ts`**

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getRunRepository, getArtifactStore } from "@/lib/storage";
import { getConnectionRegistry } from "@/lib/connections";
import { getRunBus } from "@/lib/events/run-bus";
import { normalizeMessage, type AgentSdkMessage } from "./normalizer";
import { buildSystemPrompt } from "./prompts";
import type { Connection } from "@/lib/types";

function notionMcpConfig(notion: Connection) {
  // The official Notion MCP server (stdio) authenticates with a Notion
  // integration token passed via OPENAPI_MCP_HEADERS.
  return {
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: {
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization: `Bearer ${notion.token}`,
        "Notion-Version": "2022-06-28",
      }),
    },
  };
}

export async function startRun(runId: string): Promise<void> {
  const repo = getRunRepository();
  const artifacts = getArtifactStore();
  const bus = getRunBus();
  const connections = getConnectionRegistry();

  const run = repo.getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);

  const enabledConnections = connections
    .list()
    .filter((c) => run.connectionsEnabled.includes(c.id) && c.enabled);

  const setStatus = (status: "running" | "completed" | "failed", error?: string) => {
    repo.setStatus(runId, status, error);
    bus.publish(runId, { kind: "status", status, error });
  };

  const emitStep = (step: Parameters<typeof repo.appendStep>[1]) => {
    const full = repo.appendStep(runId, step);
    bus.publish(runId, { kind: "step", step: full });
  };

  try {
    const cwd = await artifacts.ensureRunDir(runId);
    setStatus("running");

    const notion = enabledConnections.find((c) => c.type === "notion");
    const notionReady = notion && notion.token && notion.parentPageId;
    const mcpServers = notionReady ? { notion: notionMcpConfig(notion!) } : undefined;

    if (notion && !notionReady) {
      emitStep({
        type: "error",
        title: "Notion connection skipped",
        detail: "Notion is enabled but missing a token or parent page id; continuing without it.",
        status: "error",
      });
    }

    const systemPrompt = buildSystemPrompt(enabledConnections);
    const taskPrompt = `Run id: ${runId}\n\nTask:\n${run.prompt}`;

    const iterator = query({
      prompt: taskPrompt,
      options: {
        model: process.env.AGENT_MODEL || "claude-opus-4-8",
        systemPrompt,
        cwd,
        permissionMode: "bypassPermissions",
        allowedTools: ["Read", "Write", "WebSearch", "WebFetch", "Glob", "Grep", "Bash"],
        ...(mcpServers ? { mcpServers } : {}),
      },
    });

    for await (const message of iterator as AsyncIterable<AgentSdkMessage>) {
      for (const step of normalizeMessage(message)) {
        emitStep(step);
      }
    }

    // Register any files the agent wrote.
    const files = await artifacts.listFiles(runId);
    for (const fileName of files) {
      const ref = await artifacts.register(runId, fileName);
      if (ref) {
        repo.addArtifact(runId, ref);
        bus.publish(runId, { kind: "artifact", name: ref.name });
      }
    }

    setStatus("completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitStep({ type: "error", title: "Agent error", detail: message, status: "error" });
    setStatus("failed", message);
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. If the SDK's `Options` type rejects `permissionMode: "bypassPermissions"` or `systemPrompt` as a string, consult the installed package's types in `node_modules/@anthropic-ai/claude-agent-sdk` and adjust the literal/shape to match (the values here match the published docs). Do not remove `cwd` or `mcpServers`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: agent runner streaming Agent SDK output to repo and bus"
```

---

### Task 8: Evaluation module

**Files:**
- Create: `src/lib/evaluation/deterministic.ts`
- Create: `src/lib/evaluation/judge.ts`
- Create: `src/lib/evaluation/evaluator.ts`

**Interfaces:**
- Consumes: `getRunRepository`, `getArtifactStore` from `@/lib/storage`; `getRunBus` from `@/lib/events/run-bus`; `Anthropic` from `@anthropic-ai/sdk`; types from `@/lib/types`.
- Produces: `evaluateRun(runId: string): Promise<EvaluationResult>` — runs deterministic checks on the run's primary artifact + an LLM judge over (prompt, artifact preview), stores the result via the repo, and publishes an `evaluation` event. Also exports `runDeterministicChecks(fileName: string, csv: string): DeterministicCheck[]` and `judge(input): Promise<{score: number; reasons: string[]}>`.

- [ ] **Step 1: Create `src/lib/evaluation/deterministic.ts`**

```typescript
import type { DeterministicCheck } from "@/lib/types";

/** Minimal CSV row count + header presence checks (no full RFC parser needed). */
export function runDeterministicChecks(fileName: string, content: string): DeterministicCheck[] {
  const checks: DeterministicCheck[] = [];

  const nonEmpty = content.trim().length > 0;
  checks.push({
    name: "file-non-empty",
    passed: nonEmpty,
    detail: nonEmpty ? `${content.length} bytes` : "file is empty",
  });

  const isCsv = fileName.toLowerCase().endsWith(".csv");
  if (isCsv) {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const hasHeader = lines.length >= 1 && lines[0].includes(",");
    checks.push({
      name: "csv-has-header",
      passed: hasHeader,
      detail: hasHeader ? `header: ${lines[0].slice(0, 200)}` : "no comma-delimited header row found",
    });

    const dataRows = Math.max(0, lines.length - 1);
    checks.push({
      name: "csv-has-data-rows",
      passed: dataRows >= 1,
      detail: `${dataRows} data row(s)`,
    });
  }

  return checks;
}
```

- [ ] **Step 2: Create `src/lib/evaluation/judge.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";

export interface JudgeInput {
  prompt: string;
  artifactName: string;
  artifactPreview: string;
}

export interface JudgeOutput {
  score: number; // 0..1
  reasons: string[];
}

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number" },
    reasons: { type: "array", items: { type: "string" } },
  },
  required: ["score", "reasons"],
  additionalProperties: false,
} as const;

export async function judge(input: JudgeInput): Promise<JudgeOutput> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const model = process.env.JUDGE_MODEL || "claude-opus-4-8";

  const userContent = [
    "You are evaluating whether an automation agent successfully completed a task.",
    "Score from 0.0 (total failure) to 1.0 (fully successful) and give 1-4 short reasons.",
    "Judge whether the artifact actually satisfies the task — correct content, plausible and non-empty data, right format.",
    "",
    `TASK:\n${input.prompt}`,
    "",
    `ARTIFACT (${input.artifactName}), first portion:\n${input.artifactPreview}`,
  ].join("\n");

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
  let parsed: JudgeOutput;
  try {
    parsed = JSON.parse(raw) as JudgeOutput;
  } catch {
    parsed = { score: 0, reasons: ["Judge returned unparseable output."] };
  }
  const score = Math.max(0, Math.min(1, Number(parsed.score) || 0));
  const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [];
  return { score, reasons };
}
```

- [ ] **Step 3: Create `src/lib/evaluation/evaluator.ts`**

```typescript
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
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. If `output_config` is not accepted by the installed `@anthropic-ai/sdk` types, fall back to instructing JSON in the prompt and parsing the text block (remove the `output_config` field); the rest of the logic is unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: hybrid evaluation (deterministic CSV checks + LLM judge)"
```

---

### Task 9: API — create run + list runs

**Files:**
- Create: `src/app/api/runs/route.ts`

**Interfaces:**
- Consumes: `getRunRepository` from `@/lib/storage`; `getConnectionRegistry` from `@/lib/connections`; `startRun` from `@/lib/agent/agent-runner`; `evaluateRun` from `@/lib/evaluation/evaluator`; `getRunBus` from `@/lib/events/run-bus`.
- Produces:
  - `POST /api/runs` body `{ prompt: string; connectionIds?: string[] }` → `{ runId }` (201). Creates the run, then kicks off `startRun(runId)` in the background; on completion (success) chains `evaluateRun(runId)`, then publishes a `done` event. Errors during the background chain are already captured as failed status by the runner.
  - `GET /api/runs` → `{ runs: Run[] }` (newest first).
- A run id is generated with `crypto.randomUUID()`.

- [ ] **Step 1: Create `src/app/api/runs/route.ts`**

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: POST/GET /api/runs — create and list runs"
```

---

### Task 10: API — run state replay + SSE stream

**Files:**
- Create: `src/app/api/runs/[id]/route.ts`
- Create: `src/app/api/runs/[id]/stream/route.ts`

**Interfaces:**
- Consumes: `getRunRepository` from `@/lib/storage`; `getRunBus`, `RunEvent` from `@/lib/events/run-bus`.
- Produces:
  - `GET /api/runs/:id` → the full `Run` JSON (404 if missing). Used for replay on refresh/reconnect.
  - `GET /api/runs/:id/stream` → `text/event-stream`. On connect it (a) replays the current run state as one `snapshot` event, then (b) forwards live `RunEvent`s. Closes after a `done` event or when the client disconnects.

**Note on Next.js 15:** the second arg to a dynamic route handler is `{ params: Promise<{ id: string }> }` — `await` it.

- [ ] **Step 1: Create `src/app/api/runs/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getRunRepository } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRunRepository().getRun(id);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json(run);
}
```

- [ ] **Step 2: Create `src/app/api/runs/[id]/stream/route.ts`**

```typescript
import { getRunRepository } from "@/lib/storage";
import { getRunBus, type RunEvent } from "@/lib/events/run-bus";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getRunRepository();
  const bus = getRunBus();

  const run = repo.getRun(id);
  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // 1. Replay current state so a refresh/reconnect loses nothing.
      send("snapshot", repo.getRun(id));

      // 2. If the run is already finished, close immediately after the snapshot.
      const current = repo.getRun(id);
      if (current && (current.status === "completed" || current.status === "failed")) {
        send("done", {});
        closed = true;
        controller.close();
        return;
      }

      // 3. Forward live events.
      const unsubscribe = bus.subscribe(id, (e: RunEvent) => {
        send("event", e);
        if (e.kind === "done") {
          unsubscribe();
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      });

      // Keepalive comments so proxies don't drop an idle connection.
      const keepalive = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      // Clean up if the client disconnects.
      _request.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        unsubscribe();
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: run state replay endpoint and SSE stream"
```

---

### Task 11: API — artifact download

**Files:**
- Create: `src/app/api/runs/[id]/artifacts/[name]/route.ts`

**Interfaces:**
- Consumes: `getArtifactStore` from `@/lib/storage`.
- Produces: `GET /api/runs/:id/artifacts/:name` → streams the file with `Content-Type` from the ref and `Content-Disposition: attachment`. 404 if missing.

- [ ] **Step 1: Create `src/app/api/runs/[id]/artifacts/[name]/route.ts`**

```typescript
import { getArtifactStore } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const { id, name } = await params;
  const decoded = decodeURIComponent(name);
  const result = await getArtifactStore().read(id, decoded);
  if (!result) return new Response("Artifact not found", { status: 404 });

  return new Response(new Uint8Array(result.data), {
    headers: {
      "Content-Type": result.ref.contentType,
      "Content-Disposition": `attachment; filename="${result.ref.name}"`,
      "Content-Length": String(result.ref.sizeBytes),
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: artifact download endpoint"
```

---

### Task 12: API — connections list + update

**Files:**
- Create: `src/app/api/connections/route.ts`

**Interfaces:**
- Consumes: `getConnectionRegistry` from `@/lib/connections`.
- Produces:
  - `GET /api/connections` → `{ connections: ConnectionPublic[] }` (secrets redacted).
  - `PUT /api/connections` body `{ id: string; enabled?: boolean; token?: string; parentPageId?: string }` → updated `{ connection: ConnectionPublic }`. 404 if id unknown.

- [ ] **Step 1: Create `src/app/api/connections/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getConnectionRegistry } from "@/lib/connections";

export const runtime = "nodejs";

export async function GET() {
  const registry = getConnectionRegistry();
  const connections = registry.list().map((c) => registry.toPublic(c));
  return NextResponse.json({ connections });
}

export async function PUT(request: Request) {
  let body: { id?: string; enabled?: boolean; token?: string; parentPageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const registry = getConnectionRegistry();
  if (!registry.get(body.id)) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const patch: { enabled?: boolean; token?: string; parentPageId?: string } = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.token === "string") patch.token = body.token;
  if (typeof body.parentPageId === "string") patch.parentPageId = body.parentPageId;

  const updated = registry.update(body.id, patch);
  return NextResponse.json({ connection: registry.toPublic(updated) });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: connections list/update API"
```

---

### Task 13: Frontend — main page (composer, connections panel, runs list)

**Files:**
- Create: `src/app/page.tsx` (replace placeholder)
- Create: `src/app/ui.module.css`

**Interfaces:**
- Consumes: `GET/PUT /api/connections`, `GET/POST /api/runs`. Uses `ConnectionPublic`, `Run` from `@/lib/types`.
- Produces: a client component home page with: a prompt textarea + "Run automation" button (POST /api/runs, then navigate to `/runs/:id`), a connections panel (toggle Notion enabled; edit token + parentPageId), and a runs list (links to `/runs/:id`) with a refresh.

- [ ] **Step 1: Create `src/app/ui.module.css`**

```css
.page { max-width: 980px; margin: 0 auto; padding: 24px; }
.h1 { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--muted); margin: 0 0 20px; font-size: 13px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
.row { display: flex; gap: 12px; align-items: center; }
.between { justify-content: space-between; }
.label { font-size: 12px; color: var(--muted); display: block; margin-bottom: 4px; }
.textarea { width: 100%; min-height: 90px; background: #0c0e12; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px; font-size: 14px; }
.input { width: 100%; background: #0c0e12; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-size: 13px; }
.btn { background: var(--accent); color: white; border: 0; border-radius: 8px; padding: 10px 16px; font-size: 14px; cursor: pointer; }
.btn:disabled { opacity: 0.5; cursor: default; }
.btnGhost { background: transparent; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.list { list-style: none; padding: 0; margin: 0; }
.listItem { padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; gap: 12px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); }
.pass { color: var(--green); border-color: var(--green); }
.fail { color: var(--red); border-color: var(--red); }
.running { color: var(--amber); border-color: var(--amber); }
.muted { color: var(--muted); font-size: 12px; }
.switch { cursor: pointer; }

- [ ] **Step 2: Create `src/app/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./ui.module.css";
import type { ConnectionPublic, Run } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(
    "Fetch the latest AI news from the web and save them into a CSV.",
  );
  const [connections, setConnections] = useState<ConnectionPublic[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    const res = await fetch("/api/connections");
    const data = await res.json();
    setConnections(data.connections ?? []);
  }, []);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/runs");
    const data = await res.json();
    setRuns(data.runs ?? []);
  }, []);

  useEffect(() => {
    void loadConnections();
    void loadRuns();
  }, [loadConnections, loadRuns]);

  async function updateConnection(id: string, patch: Partial<ConnectionPublic> & { token?: string }) {
    await fetch("/api/connections", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    await loadConnections();
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const connectionIds = connections.filter((c) => c.enabled).map((c) => c.id);
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, connectionIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const { runId } = await res.json();
      router.push(`/runs/${runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.h1}>duvo.ai · Automation</h1>
      <p className={styles.sub}>Send one instruction to the agent and watch it run.</p>

      <section className={styles.panel}>
        <label className={styles.label}>Instruction</label>
        <textarea
          className={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className={styles.row} style={{ marginTop: 12 }}>
          <button className={styles.btn} onClick={submit} disabled={submitting || !prompt.trim()}>
            {submitting ? "Starting…" : "Run automation"}
          </button>
          {error && <span className={styles.fail}>{error}</span>}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={`${styles.row} ${styles.between}`}>
          <strong>Connections</strong>
          <span className={styles.muted}>Enable a data connection for the agent to use.</span>
        </div>
        {connections.map((c) => (
          <div key={c.id} style={{ marginTop: 12 }}>
            <div className={`${styles.row} ${styles.between}`}>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => updateConnection(c.id, { enabled: e.target.checked })}
                />{" "}
                {c.name}
              </label>
              <span className={c.configured ? styles.pass : styles.running + " " + styles.badge}>
                {c.configured ? "configured" : "needs token + page id"}
              </span>
            </div>
            {c.type === "notion" && (
              <div className={styles.row} style={{ marginTop: 8, gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Notion integration token</label>
                  <input
                    className={styles.input}
                    type="password"
                    placeholder="ntn_… / secret_…"
                    onBlur={(e) => e.target.value && updateConnection(c.id, { token: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Parent page id</label>
                  <input
                    className={styles.input}
                    defaultValue={c.parentPageId ?? ""}
                    placeholder="32-char page id"
                    onBlur={(e) => updateConnection(c.id, { parentPageId: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className={styles.panel}>
        <div className={`${styles.row} ${styles.between}`}>
          <strong>Previous runs</strong>
          <button className={styles.btnGhost} onClick={() => loadRuns()}>Refresh</button>
        </div>
        <ul className={styles.list}>
          {runs.length === 0 && <li className={styles.muted} style={{ paddingTop: 10 }}>No runs yet.</li>}
          {runs.map((r) => (
            <li key={r.id} className={styles.listItem}>
              <a href={`/runs/${r.id}`} style={{ flex: 1 }}>
                {r.prompt.slice(0, 80)}
              </a>
              <span className={styles.muted}>{r.status}</span>
              {r.evaluation && (
                <span className={`${styles.badge} ${r.evaluation.verdict === "pass" ? styles.pass : styles.fail}`}>
                  {r.evaluation.verdict}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run build`
Expected: builds with no errors; `/` is a client route.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: home page — composer, connections panel, runs list"
```

---

### Task 14: Frontend — run view with live SSE timeline

**Files:**
- Create: `src/app/runs/[id]/page.tsx`
- Create: `src/app/runs/[id]/useRunStream.ts`

**Interfaces:**
- Consumes: `GET /api/runs/:id/stream` (SSE), `Run`, `RunStep`, `EvaluationResult` from `@/lib/types`. Reuses `src/app/ui.module.css`.
- Produces: a client run-view page rendering a key-state header (status, step count, tools used, connections active, artifacts, verdict — all derived from the `Run`), a live step timeline, an artifact download link, and an evaluation card. The `useRunStream` hook maintains a `Run` from the `snapshot` event then applies live `event`s.

- [ ] **Step 1: Create `src/app/runs/[id]/useRunStream.ts`**

```typescript
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
```

- [ ] **Step 2: Create `src/app/runs/[id]/page.tsx`**

```tsx
"use client";

import { use } from "react";
import styles from "../../ui.module.css";
import { useRunStream } from "./useRunStream";

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed" ? styles.pass : status === "failed" ? styles.fail : styles.running;
  return <span className={`${styles.badge} ${cls}`}>{status}</span>;
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { run, connected } = useRunStream(id);

  if (!run) {
    return (
      <main className={styles.page}>
        <a href="/">← Back</a>
        <p className={styles.muted} style={{ marginTop: 16 }}>Loading run…</p>
      </main>
    );
  }

  const toolsUsed = Array.from(
    new Set(run.steps.filter((s) => s.toolName).map((s) => s.toolName!)),
  );

  return (
    <main className={styles.page}>
      <a href="/">← Back</a>

      <section className={styles.panel} style={{ marginTop: 12 }}>
        <div className={`${styles.row} ${styles.between}`}>
          <h1 className={styles.h1}>Run {id.slice(0, 8)}</h1>
          <StatusBadge status={run.status} />
        </div>
        <p className={styles.sub}>{run.prompt}</p>
        <div className={styles.row} style={{ gap: 16, flexWrap: "wrap" }}>
          <span className={styles.muted}>Steps: {run.steps.length}</span>
          <span className={styles.muted}>
            Connections: {run.connectionsEnabled.length ? run.connectionsEnabled.join(", ") : "none"}
          </span>
          <span className={styles.muted}>Tools: {toolsUsed.length ? toolsUsed.join(", ") : "—"}</span>
          <span className={styles.muted}>{connected ? "● live" : "○ idle"}</span>
        </div>
        {run.error && <p className={styles.fail}>{run.error}</p>}
      </section>

      {run.artifacts.length > 0 && (
        <section className={styles.panel}>
          <strong>Artifacts</strong>
          <ul className={styles.list}>
            {run.artifacts.map((a) => (
              <li key={a.name} className={styles.listItem}>
                <span>{a.name}</span>
                <a href={`/api/runs/${id}/artifacts/${encodeURIComponent(a.name)}`} download>
                  Download
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {run.evaluation && (
        <section className={styles.panel}>
          <div className={`${styles.row} ${styles.between}`}>
            <strong>Evaluation</strong>
            <span
              className={`${styles.badge} ${run.evaluation.verdict === "pass" ? styles.pass : styles.fail}`}
            >
              {run.evaluation.verdict} · {(run.evaluation.score * 100).toFixed(0)}%
            </span>
          </div>
          <ul className={styles.list}>
            {run.evaluation.deterministicChecks.map((c) => (
              <li key={c.name} className={styles.listItem}>
                <span>{c.passed ? "✓" : "✗"} {c.name}</span>
                <span className={styles.muted}>{c.detail}</span>
              </li>
            ))}
          </ul>
          {run.evaluation.judgeReasons.length > 0 && (
            <ul className={styles.muted} style={{ marginTop: 8 }}>
              {run.evaluation.judgeReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={styles.panel}>
        <strong>Timeline</strong>
        <ul className={styles.list}>
          {run.steps.map((s) => (
            <li key={s.seq} className={styles.listItem}>
              <div style={{ flex: 1 }}>
                <div className={s.type === "mcp_call" ? styles.running : undefined}>
                  {s.type === "mcp_call" ? "🔌 " : ""}
                  {s.title}
                </div>
                {s.detail && (
                  <pre className={styles.muted} style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                    {s.detail}
                  </pre>
                )}
              </div>
              <span className={styles.muted}>{s.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run build`
Expected: builds with no errors; `/runs/[id]` route present.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: run view with live SSE timeline, key-state header, eval card"
```

---

### Task 15: End-to-end manual verification

**Files:**
- Modify: `README.md` (append a "Running locally" section)

**Interfaces:**
- Consumes: the whole app.
- Produces: a verified working flow and run instructions in the README.

- [ ] **Step 1: Create `.env.local` from the example**

Run: `cp .env.local.example .env.local` then set `ANTHROPIC_API_KEY` to the real key (from the 1Password link). Leave Notion blank for the first pass.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Expected: server listening on `http://localhost:3000`.

- [ ] **Step 3: Run the headline task (Notion OFF)**

In the browser: submit the default prompt ("Fetch the latest AI news from the web and save them into a CSV."). Watch `/runs/:id`.
Expected: status goes `running` → `completed`; timeline shows WebSearch/WebFetch tool steps and a Write step; an artifact (a `.csv`) appears with a working Download link; an Evaluation card shows deterministic checks passing and an LLM-judge verdict. Confirm the downloaded CSV has a header and rows.

- [ ] **Step 4: Verify refresh-resilience**

While a run is in progress (or after), reload `/runs/:id`.
Expected: the page rebuilds full state from the `snapshot` event — no steps lost.

- [ ] **Step 5: Run with Notion ON (optional, if a Notion token is available)**

On the home page, enable Notion, paste an integration token and a parent page id (the integration must be shared with that page in Notion). Submit a prompt. 
Expected: the timeline shows a distinct `🔌 Connection · …` MCP step; a new Notion page titled with the run id is created under the parent, containing a summary. Toggle Notion OFF and re-run: timeline shows no Notion step.

- [ ] **Step 6: Append run instructions to `README.md`**

Append:

```markdown

---

## Running locally

1. `npm install`
2. `cp .env.local.example .env.local` and set `ANTHROPIC_API_KEY`.
3. `npm run dev` and open http://localhost:3000.
4. Enter an instruction (default fetches AI news → CSV) and click **Run automation**.
5. Watch the run unfold step-by-step; download the output CSV; review the automatic evaluation.

### Notion connection (Step 4 / data connection)
- Create a Notion internal integration, copy its token, and share a parent page with the integration.
- In the UI, enable **Notion**, paste the token and the parent page id.
- When enabled, the agent creates a Notion page (titled with the run id) summarizing the results; disable it to skip that step.

State is in-memory (runs reset on restart); artifacts are written under `RUN_DATA_DIR` (default `.run-data`). The storage and connection layers are interface-based so Postgres + a blob store can be added later without touching the rest of the app.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: local run + Notion setup instructions"
```

---

## Notes for the implementer

- **Agent SDK type drift:** Task 6/7 read the SDK message stream defensively. If the installed `@anthropic-ai/claude-agent-sdk` exports stricter types that conflict with the loose `AgentSdkMessage`, cast at the boundary (`as AsyncIterable<AgentSdkMessage>`) rather than rewriting the normalizer. Confirm `query`, `Options.mcpServers`, `Options.permissionMode`, and `Options.systemPrompt` against `node_modules/@anthropic-ai/claude-agent-sdk` types before finishing Task 7.
- **Judge structured output:** if `output_config` isn't typed in the installed `@anthropic-ai/sdk`, switch the judge to plain JSON-in-prompt + `JSON.parse` of the text block (the parsing fallback is already in the code).
- **Node runtime is mandatory** on every route handler — the Agent SDK and the Notion MCP server are child processes and cannot run on the Edge runtime.
