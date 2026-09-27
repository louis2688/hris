import "server-only";
import { aiProviderFor } from "@hris/shared";
import { AppError } from "./services/errors";

/**
 * Minimal Claude Messages API client over fetch (no SDK).
 * Env: ANTHROPIC_API_KEY, AI_MODEL (default below), AI_PROVIDER=mock for a deterministic offline fake.
 * Never log prompts or tool data here: they contain personal data. Only status / error type / request id.
 */
export const AI_NOT_CONFIGURED = "AI is not configured - ask an admin to set ANTHROPIC_API_KEY";
export const aiProvider = () => aiProviderFor(process.env);
const MODEL = () => process.env.AI_MODEL || "claude-sonnet-5";
const API = "https://api.anthropic.com/v1/messages";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "thinking"; thinking: string; signature: string };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type Tool = { name: string; description: string; input_schema: Record<string, unknown>; strict?: boolean };
export type Reply = { content: Block[]; stop_reason: string | null };
export type ChatOpts = {
  system: string;
  messages: Msg[];
  tools?: Tool[];
  toolChoice?: { type: "auto" | "none" | "any" } | { type: "tool"; name: string };
  maxTokens: number;
  /** Set to stream (SSE); called with each text delta. */
  onText?: (t: string) => void;
};

const aiError = (message: string) => new AppError(message, "AI_ERROR", 502);

function httpError(status: number) {
  if (status === 401 || status === 403) return aiError("AI is misconfigured - ask an admin to check ANTHROPIC_API_KEY");
  if (status === 429) return aiError("The AI service is busy. Try again in a minute.");
  if (status === 413) return aiError("That is too large for the AI service. Try a smaller file.");
  if (status === 400) return aiError("The AI service could not process this request.");
  return aiError("The AI service is temporarily unavailable. Try again shortly.");
}
const STREAM_ERRORS: Record<string, number> = { overloaded_error: 529, rate_limit_error: 429, api_error: 500, invalid_request_error: 400, request_too_large: 413 };

function mapThrown(e: unknown): Error {
  if (e instanceof AppError) return e;
  const name = (e as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") return aiError("The AI service took too long to respond. Try again.");
  console.error("ai: network error", name);
  return aiError("Could not reach the AI service. Try again shortly.");
}

export async function chat(o: ChatOpts): Promise<Reply> {
  const provider = aiProvider();
  if (!provider) throw new AppError(AI_NOT_CONFIGURED, "AI_NOT_CONFIGURED", 503);
  if (provider === "mock") return mockChat(o);
  const stream = !!o.onText;
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: o.maxTokens,
        system: o.system,
        messages: o.messages,
        ...(o.tools?.length ? { tools: o.tools, tool_choice: o.toolChoice ?? { type: "auto" } } : {}),
        stream,
      }),
      signal: AbortSignal.timeout(stream ? 120_000 : 90_000),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: { type?: string; message?: string }; request_id?: string } | null;
      // Anthropic's error message says why (bad model, no credit, bad schema) and never echoes the prompt.
      console.error("ai: http", res.status, j?.error?.type, j?.request_id, j?.error?.message?.slice(0, 300));
      throw httpError(res.status);
    }
    return stream ? await readStream(res, o.onText!) : ((await res.json()) as Reply);
  } catch (e) {
    throw mapThrown(e);
  }
}

/** Parse the SSE stream into the same shape as a non-streaming reply. */
async function readStream(res: Response, onText: (t: string) => void): Promise<Reply> {
  const blocks: (Block & { _json?: string })[] = [];
  let stop: string | null = null;
  let buf = "";
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const data = buf.slice(0, i).split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim();
      buf = buf.slice(i + 2);
      if (!data) continue;
      const ev = JSON.parse(data);
      if (ev.type === "content_block_start") blocks[ev.index] = { ...ev.content_block, ...(ev.content_block.type === "tool_use" ? { _json: "" } : {}) };
      else if (ev.type === "content_block_delta") {
        const b = blocks[ev.index] as Record<string, string>;
        const d = ev.delta;
        if (d.type === "text_delta") (b.text += d.text), onText(d.text);
        else if (d.type === "input_json_delta") b._json += d.partial_json;
        else if (d.type === "thinking_delta") b.thinking += d.thinking;
        else if (d.type === "signature_delta") b.signature = d.signature;
      } else if (ev.type === "content_block_stop") {
        const b = blocks[ev.index]!;
        if (b.type === "tool_use") (b.input = b._json ? JSON.parse(b._json) : {}), delete b._json;
      } else if (ev.type === "message_delta") stop = ev.delta.stop_reason ?? stop;
      else if (ev.type === "error") {
        console.error("ai: stream error", ev.error?.type);
        throw httpError(STREAM_ERRORS[ev.error?.type] ?? 500);
      }
    }
  }
  return { content: blocks.filter(Boolean), stop_reason: stop };
}

/**
 * Tool-use loop: model asks for tools -> run them -> send tool_result -> repeat.
 * Max 5 tool rounds; the last call forbids tools so the model must answer.
 */
export async function toolLoop(o: ChatOpts & { run: (name: string, input: Record<string, unknown>) => Promise<unknown>; onTool?: (name: string) => void }) {
  const messages = [...o.messages];
  for (let round = 0; ; round++) {
    const r = await chat({ ...o, messages, toolChoice: round >= 5 ? { type: "none" } : o.toolChoice });
    const uses = r.content.filter((b) => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !uses.length || round >= 5) return r;
    messages.push({ role: "assistant", content: r.content });
    const results: Block[] = [];
    for (const u of uses) {
      o.onTool?.(u.name);
      try {
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify((await o.run(u.name, u.input)) ?? null) });
      } catch (e) {
        if (!(e instanceof AppError)) console.error("ai: tool failed", u.name, (e as Error)?.message);
        results.push({ type: "tool_result", tool_use_id: u.id, content: e instanceof AppError ? e.message : "Tool failed", is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
}

// ---------- mock provider (AI_PROVIDER=mock): deterministic, no network, exercises the tool path ----------

const MOCK_ROUTES: [RegExp, string, (q: string) => Record<string, unknown>][] = [
  [/\b(request|requests|filed|pending|approved)\b/i, "list_my_leave_requests", () => ({})],
  [/leave|vacation|sick|balance/i, "get_leave_balances", () => ({})],
  [/holiday/i, "list_holidays", () => ({})],
  [/attendance|\blate\b|absent|dtr/i, "get_my_attendance_summary", () => ({})],
  [/payslip|salary|net pay/i, "get_latest_payslip", () => ({})],
  [/polic|handbook/i, "search_policies", (q) => ({ query: q.replace(/.*\b(on|about)\b/i, "").replace(/[?.]/g, "").trim() || q })],
  [/manager|profile|job title|department|hired/i, "get_my_profile", () => ({})],
];

const flat = (x: unknown): string =>
  x && typeof x === "object"
    ? Object.entries(x)
        .filter(([, v]) => v === null || typeof v !== "object")
        .map(([k, v]) => `${k} ${v ?? "-"}`)
        .join(", ")
    : String(x);
const bullets = (v: unknown) => (Array.isArray(v) ? v.map((x) => `- ${flat(x)}`).join("\n") || "- Nothing found." : `- ${flat(v)}`);

function mockChat(o: ChatOpts): Reply {
  const text = (t: string): Reply => {
    for (let i = 0; i < t.length; i += 24) o.onText?.(t.slice(i, i + 24));
    return { content: [{ type: "text", text: t }], stop_reason: "end_turn" };
  };
  const use = (name: string, input: Record<string, unknown>): Reply => ({ content: [{ type: "tool_use", id: `toolu_mock_${name}`, name, input }], stop_reason: "tool_use" });
  const last = o.messages.at(-1)!;
  const blocks = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content;

  if (o.tools?.some((t) => t.name === "submit_screening")) {
    const doc = blocks.find((b) => b.type === "document");
    const score = 40 + ((doc?.source.data.length ?? 0) % 51);
    return use("submit_screening", {
      score,
      summary: ["Mock screening (AI_PROVIDER=mock).", "Resume received and parsed.", "Experience partially matches the vacancy."],
      strengths: ["Clear resume structure"],
      gaps: ["Could not verify required certifications"],
      nextStep: score >= 60 ? "Schedule an initial interview" : "Keep on file",
    });
  }
  const results = blocks.filter((b) => b.type === "tool_result");
  if (results.length) return text(`Here is what I found:\n\n${results.map((r) => bullets(JSON.parse(r.content))).join("\n")}\n\n_(mock AI reply)_`);
  const q = blocks.map((b) => (b.type === "text" ? b.text : "")).join(" ");
  const route = o.toolChoice?.type === "none" ? undefined : MOCK_ROUTES.find(([re]) => re.test(q));
  if (route && o.tools?.some((t) => t.name === route[1])) return use(route[1], route[2](q));
  return text("I can help with your leave balances, leave requests, holidays, attendance, payslips, company policies and your profile. _(mock AI reply)_");
}
