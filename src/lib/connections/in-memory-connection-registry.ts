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
