import "server-only";
import type { z } from "zod";
import { AuthError } from "../auth/session";
import { AppError } from "../services/errors";

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** FormData -> plain object. Checkbox "on"/"true" -> boolean; repeated keys -> arrays. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = typeof v === "string" ? v : v.name;
    if (k in out) {
      const cur = out[k];
      out[k] = Array.isArray(cur) ? [...cur, val] : [cur, val];
    } else out[k] = val;
  }
  return out;
}

export function parse<S extends z.ZodType>(schema: S, input: unknown): { data: z.infer<S> } | { error: ActionResult<never> } {
  const r = schema.safeParse(input);
  if (r.success) return { data: r.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join(".") || "_";
    (fieldErrors[k] ??= []).push(issue.message);
  }
  return { error: { ok: false, error: "Please fix the highlighted fields", fieldErrors } };
}

/** Run a service call and convert thrown errors into ActionResult. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn(), message };
  } catch (e) {
    if (e instanceof AppError || e instanceof AuthError) return { ok: false, error: e.message };
    if ((e as { code?: string }).code === "P2002") return { ok: false, error: "That value is already in use by another record" };
    // Next.js redirect() throws; let it through.
    if (typeof e === "object" && e && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Coerce checkbox fields (missing -> false, "on"/"true" -> true). */
export function bools<T extends Record<string, unknown>>(obj: T, keys: string[]): T {
  const o: Record<string, unknown> = { ...obj };
  for (const k of keys) o[k] = o[k] === "on" || o[k] === "true" || o[k] === true;
  return o as T;
}
