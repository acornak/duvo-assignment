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
