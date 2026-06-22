# duvo.ai — Lightweight Agentic Automation Frontend — Design

**Date:** 2026-06-22
**Status:** Approved for planning

## Purpose

Build a lightweight web frontend for duvo.ai's automation platform. A user sends a
single set of instructions to an agentic system and gets a response back. The app must:

1. Send an instruction to an agentic system and return a response. (Step 1)
2. Run a useful task — "fetch the latest AI news from the web and save them into a CSV" —
   and let the user download the output file. (Step 2)
3. Let the user observe the automation as it unfolds, step by step, deriving the key
   state at any point. (Step 3)
4. Let the user "connect" to their data via an MCP server, with a clear indication the
   agent is using the connection and an enable/disable toggle. (Step 4)
5. Automatically evaluate whether the agent succeeded, based on an artifact. (Step 5)

## Key decisions

- **Stack:** Next.js (App Router) full-stack, TypeScript. One codebase; route handlers
  run the agent, React renders the UI.
- **Agent:** Claude Agent SDK (TypeScript), `query()` streaming API.
- **State:** In-memory, behind interfaces designed to be swapped for Postgres + a real
  file/blob store later. No DB now.
- **Streaming transport:** Server-Sent Events (SSE) plus an in-memory per-run event log.
  A replay endpoint (`GET /api/runs/:id`) backfills state on refresh/reconnect.
- **MCP integration:** Notion (token auth), used as a **write target** — the agent
  creates a new Notion page titled with the run ID, summarizing the search results.
  Per-run enable/disable toggle.
- **Evaluation:** Hybrid — deterministic artifact checks + an LLM-as-judge call.
- **Testing:** Deferred for now (revisit if time allows). The implementation will be
  built without a test suite initially; this overrides the default TDD workflow.

## Architecture

```
Browser (React)
  │  POST /api/runs            → start a run
  │  GET  /api/runs/:id/stream → SSE live steps
  │  GET  /api/runs/:id        → full state (replay on refresh/reconnect)
  │  GET  /api/runs            → run list
  │  GET  /api/runs/:id/artifacts/:name → download CSV
  │  GET/PUT /api/connections  → list / toggle Notion MCP + set token & parent page
  ▼
Route handlers ── AgentRunner ── Claude Agent SDK query()
                      │              └─ (optional) Notion MCP server
                      ├─ RunRepository  (in-memory → Postgres later)
                      ├─ ArtifactStore  (local fs → S3/blob later)
                      ├─ ConnectionRegistry (in-memory)
                      └─ Evaluator (deterministic checks + LLM judge)
```

## Modules & boundaries

### `lib/storage`
- `RunRepository` interface: `createRun`, `getRun`, `listRuns`, `appendStep`,
  `setStatus`, `setEvaluation`.
- `ArtifactStore` interface: `write`, `read`, `exists`, `resolveDownload`.
- Implementations now: `InMemoryRunRepository`, `LocalArtifactStore` (writes to a
  per-run working directory on local disk).
- These two interfaces are the only seam to touch when adding Postgres / S3 later.

### `lib/agent`
- `AgentRunner`: configures the SDK (system prompt, allowed tools, per-run working
  directory for artifacts, conditional Notion MCP server based on the connection
  toggle), consumes the `query()` message stream.
- **Normalizer:** pure function mapping each SDK message to a typed `RunStep`
  (`assistant_text` | `tool_use` | `tool_result` | `mcp_call` | `error` | `result`).
- Emits each step to a subscriber (for SSE) and persists it via `RunRepository`.

### `lib/connections`
- `ConnectionRegistry`: in-memory list of MCP connections. For Notion:
  `{ id, name, type: 'notion', enabled, token, parentPageId }`.
- Drives whether `AgentRunner` attaches the Notion MCP server and what the system
  prompt advertises about available connections.

### `lib/evaluation`
- `Evaluator`: combines
  - **Deterministic artifact checks:** CSV parses, ≥1 data row, expected/declared
    headers present, file non-empty.
  - **LLM-as-judge:** a separate Claude call grading the artifact + original task
    prompt → `{ verdict: pass|fail, score: 0..1, reasons: string[] }`.
- Returns a combined `EvaluationResult`.

### `app/` (UI)
- Prompt composer + connections panel (Notion toggle, token/parent-page settings).
- Runs list (sidebar), backed by `listRuns`.
- Run view: live step timeline, a **key-state header**, the final answer, artifact
  download link, and the evaluation result card.
- MCP tool calls render distinctly so it is visibly clear when the agent is using the
  Notion connection.

## Data model (the derivable state)

```
Run {
  id, prompt,
  status: queued | running | completed | failed,
  connectionsEnabled: string[],
  steps: RunStep[],
  artifacts: ArtifactRef[],
  evaluation?: EvaluationResult,
  error?, startedAt, finishedAt
}
RunStep { seq, type, title, detail?, toolName?, status, at }
ArtifactRef { name, contentType, sizeBytes, ref }
EvaluationResult { verdict, score, deterministicChecks[], judgeReasons[], at }
```

The `Run` object is the "key state at every point" the README requires: status,
current/last step, tools used, which connections were active, artifacts produced, and
the eval verdict — all derivable from it. The UI state header is a pure function of `Run`.

## Data flow for one run

1. User types prompt, toggles Notion on/off, clicks **Run**.
2. `POST /api/runs` → `RunRepository` creates the Run (`queued`), kicks off
   `AgentRunner` asynchronously, returns `{ runId }`.
3. UI opens `GET /api/runs/:id/stream` (SSE) and renders the timeline live.
4. Runner streams SDK messages → normalized `RunStep`s → appended to repo + pushed
   over SSE. Status flips to `running`. MCP tool calls render distinctly.
5. Task behavior: agent fetches the latest AI news from the web, writes a CSV into the
   run's working directory. If the Notion connection is enabled, it then creates a new
   Notion page titled with the run ID summarizing the results (visible as an `mcp_call`
   step). If disabled, the timeline shows the Notion step was skipped.
6. On completion the runner registers the CSV in `ArtifactStore`, sets `completed`, then
   auto-triggers the `Evaluator` and emits the `EvaluationResult`.
7. UI shows the download link + eval card. Refresh/reconnect re-reads
   `GET /api/runs/:id` and re-subscribes — nothing lost.

## Error handling

- Agent throws → run marked `failed`, an `error` step emitted, SSE closed cleanly.
- Notion enabled but token/parent page missing or invalid → surfaced as a
  connection-error step; the run continues in degraded mode (CSV still produced) rather
  than hard-failing, and the UI shows the connection as errored.
- Missing/empty artifact at eval time → deterministic checks fail → eval verdict `fail`
  with a clear reason; LLM judge skipped.
- SSE drop → client reconnects; the replay endpoint backfills.

## Testing strategy

Deferred. No automated test suite in the initial build, per explicit instruction.
Revisit if time allows — likely targets when resumed: the SDK→`RunStep` normalizer,
deterministic evaluators, storage impls, and an end-to-end run driven by a fake stream.

## Future extensibility (designed for, not built now)

- Swap `InMemoryRunRepository` → Postgres-backed repo (same interface).
- Swap `LocalArtifactStore` → S3/blob store (same interface).
- `ConnectionRegistry` can hold additional MCP connection types beyond Notion.
