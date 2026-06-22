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
        // bypassPermissions requires the companion safety flag
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
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
