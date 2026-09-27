import { expenseSchema } from "@hris/shared";
import { apiError, body, handler, json } from "@/server/api";
import { createExpense } from "@/server/services/requests";

/**
 * POST /api/v1/requests/expenses
 * JSON { date, category, amount, description }, or multipart/form-data with the same fields plus a `receipt` file.
 */
export const POST = handler(async ({ req, user }) => {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) return json({ request: await createExpense(user, await body(req, expenseSchema)) }, 201);
  const fd = await req.formData();
  const receipt = fd.get("receipt");
  const r = expenseSchema.safeParse({ date: fd.get("date"), category: fd.get("category"), amount: fd.get("amount"), description: fd.get("description") });
  if (!r.success) return apiError(422, "VALIDATION", "Invalid request", r.error.flatten().fieldErrors);
  return json({ request: await createExpense(user, r.data, receipt instanceof File ? receipt : null) }, 201);
});
