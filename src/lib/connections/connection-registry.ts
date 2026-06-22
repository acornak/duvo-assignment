import type { Connection, ConnectionPublic } from "@/lib/types";

export type ConnectionPatch = Partial<Pick<Connection, "enabled" | "token" | "parentPageId">>;

export interface ConnectionRegistry {
  list(): Connection[];
  get(id: string): Connection | undefined;
  update(id: string, patch: ConnectionPatch): Connection;
  toPublic(c: Connection): ConnectionPublic;
}
