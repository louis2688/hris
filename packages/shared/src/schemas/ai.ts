import { z } from "zod";
import { AI_MAX_INPUT } from "../constants";

/** Only the last N chat turns are sent to the model (conversation lives in client state only). */
export const AI_HISTORY = 12;

export const assistantRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(8000) }))
    .min(1)
    .max(50)
    .refine((m) => m.at(-1)?.role === "user", "Last message must be from the user")
    .refine((m) => m.at(-1)!.content.length <= AI_MAX_INPUT, `Keep your question under ${AI_MAX_INPUT} characters`),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/** Structured result of an AI resume screen (stored as JSON in Candidate.aiSummary). */
export const screeningResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.array(z.string().trim().min(1).max(400)).min(1).max(6),
  strengths: z.array(z.string().trim().min(1).max(300)).max(8),
  gaps: z.array(z.string().trim().min(1).max(300)).max(8),
  nextStep: z.string().trim().min(1).max(300),
});
export type ScreeningResult = z.infer<typeof screeningResultSchema>;

/** Which AI backend is active. null = not configured (features show a friendly disabled state). */
export function aiProviderFor(env: Record<string, string | undefined>): "mock" | "anthropic" | null {
  if (env.AI_PROVIDER === "mock") return "mock";
  return env.ANTHROPIC_API_KEY ? "anthropic" : null;
}
