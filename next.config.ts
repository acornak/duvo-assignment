import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Agent SDK and Notion MCP server are spawned as child processes at
  // runtime; keep them external so Next doesn't try to bundle them.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
