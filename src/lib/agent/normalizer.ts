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
