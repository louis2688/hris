import { z } from "zod";
import { apiError, body, handler, json } from "@/server/api";
import { submitSurvey } from "@/server/services/surveys";

const schema = z.object({ answers: z.record(z.string(), z.union([z.string(), z.number()])) });

/** POST /api/v1/surveys/:id/responses { answers: { [questionId]: value } } -> 201 once per employee, 409 on repeat. */
export const POST = handler<{ id: string }>(async ({ req, params, user }) => {
  const { answers } = await body(req, schema);
  try {
    await submitSurvey(user, params.id, answers);
  } catch (e) {
    const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
    if (fe) return apiError(422, "VALIDATION", "Please answer the required questions", fe);
    throw e;
  }
  return json({ ok: true }, 201);
});
