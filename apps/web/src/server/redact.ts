// No imports: node --test src/server/redact.test.mjs exercises it directly.
const SECRET_KEY = /password|secret|hash$|^token$/i;

/** Deep JSON copy for audit rows: password/key hashes, tokens and raw bytes (photos, files) never reach the audit log. */
export function auditSafe(v: unknown): unknown {
  if (v === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(v, function (this: Record<string, unknown>, k, x) {
      if (k && SECRET_KEY.test(k)) return "[redacted]";
      return this[k] instanceof Uint8Array ? "[bytes]" : x;
    }),
  );
}
