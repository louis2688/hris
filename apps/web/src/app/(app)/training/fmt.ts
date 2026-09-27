const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const t = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

/** "5 Oct 2026, 9:00 am - 5:00 pm" in Asia/Manila; shows both dates when the event spans days. */
export const fmtRange = (a: Date, b: Date) => `${f.format(a)} - ${day(a) === day(b) ? t.format(b) : f.format(b)}`;
export const peso = (n: number | string | null | undefined) => (n == null ? "-" : `PHP ${Number(n).toLocaleString("en-PH", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`);
