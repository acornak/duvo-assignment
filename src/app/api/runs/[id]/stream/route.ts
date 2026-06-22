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
          clearInterval(keepalive);
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
