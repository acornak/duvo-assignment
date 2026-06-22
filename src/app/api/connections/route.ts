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
