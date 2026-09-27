import { assistantRequestSchema } from "@hris/shared";
import { apiError, body, handler } from "@/server/api";
import { AI_NOT_CONFIGURED, aiProvider } from "@/server/ai";
import { AppError } from "@/server/services/errors";
import { askAssistant, assistantLimit, type AssistantEvent } from "@/server/services/assistant";

export const maxDuration = 120;

/**
 * POST /api/v1/assistant { messages: [{ role, content }] } (cookie or bearer).
 * Streams NDJSON events: {type:"tool",name} | {type:"text",text} | {type:"error",message} | {type:"done"}.
 * Conversation state lives on the client; nothing is stored.
 */
export const POST = handler(async ({ req, user }) => {
  if (!aiProvider()) return apiError(503, "AI_NOT_CONFIGURED", AI_NOT_CONFIGURED);
  const input = await body(req, assistantRequestSchema);
  if (!(await assistantLimit(user.id)).ok) return apiError(429, "RATE_LIMITED", "You are sending messages too quickly. Wait a few seconds and try again.");
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      // Client may disconnect mid-stream; enqueue/close then throw and there is nobody to tell.
      const safe = (f: () => void) => { try { f(); } catch {} };
      const emit = (e: AssistantEvent) => safe(() => ctrl.enqueue(enc.encode(JSON.stringify(e) + "\n")));
      try {
        await askAssistant(user, input, emit);
        emit({ type: "done" });
      } catch (e) {
        if (!(e instanceof AppError)) console.error("assistant failed", (e as Error)?.message);
        emit({ type: "error", message: e instanceof AppError ? e.message : "Something went wrong. Please try again." });
      }
      safe(() => ctrl.close());
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
});
