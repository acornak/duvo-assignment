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
