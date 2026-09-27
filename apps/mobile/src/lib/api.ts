import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetch as expoFetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import type { CorrectionInput, DtrRow, DtrTotals, LeaveStatus, PunchMethod, SessionUser, SurveyQuestion } from "@hris/shared";

const BASE = `${(process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/api/v1`;
const K = { access: "hris.access", refresh: "hris.refresh", user: "hris.user" };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Tokens = { accessToken: string; refreshToken: string };

let access: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: () => void = () => {};
export const setSignedOutHandler = (fn: () => void) => void (onSignedOut = fn);

export async function saveSession(t: Tokens, user?: SessionUser) {
  access = t.accessToken;
  await SecureStore.setItemAsync(K.access, t.accessToken);
  await SecureStore.setItemAsync(K.refresh, t.refreshToken);
  if (user) await SecureStore.setItemAsync(K.user, JSON.stringify(user));
}

export async function loadUser(): Promise<SessionUser | null> {
  const [u, rt] = await Promise.all([SecureStore.getItemAsync(K.user), SecureStore.getItemAsync(K.refresh)]);
  return u && rt ? (JSON.parse(u) as SessionUser) : null;
}

async function clearSession() {
  access = null;
  await Promise.all(Object.values(K).map((k) => SecureStore.deleteItemAsync(k)));
}

/** Revoke the refresh token server-side (best effort), then wipe local tokens either way. */
export async function logout() {
  const refreshToken = await SecureStore.getItemAsync(K.refresh);
  if (refreshToken) await api("/auth/logout", { body: { refreshToken } }).catch(() => {});
  await clearSession();
}

/** FormData bodies keep fetch's own multipart content-type (with boundary). */
const send = (path: string, init: RequestInit, token: string | null) =>
  fetch(BASE + path, {
    ...init,
    headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });

/** One refresh at a time: concurrent 401s share it, so the rotating refresh token is only spent once. */
function refresh(): Promise<boolean> {
  return (refreshing ??= (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(K.refresh);
      if (!refreshToken) return false;
      const res = await send("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) }, null);
      if (res.status === 401) return false;
      if (!res.ok) throw new ApiError(res.status, "REFRESH_FAILED", "Could not reach the server. Try again.");
      const t = (await res.json()) as Tokens & { user?: SessionUser };
      await saveSession(t, t.user);
      return true;
    } finally {
      refreshing = null;
    }
  })());
}

/** Runs `go` with the access token; on 401 refreshes once and retries. Network failures become ApiError(0). */
async function authed<R extends { status: number }>(go: (token: string | null) => Promise<R>): Promise<R> {
  access ??= await SecureStore.getItemAsync(K.access);
  const used = access;
  try {
    let res = await go(used);
    if (res.status === 401 && used) {
      // Another call may already have rotated the pair; otherwise refresh once and retry.
      if (access !== used || (await refresh())) res = await go(access);
      else {
        await clearSession();
        onSignedOut();
      }
    }
    return res;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "NETWORK", `Can't reach ${BASE.replace(/\/api\/v1$/, "")}. Check your connection or EXPO_PUBLIC_API_URL.`);
  }
}

/** JSON (or FormData) request to /api/v1. Throws ApiError with the server's { error: { code, message } }. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const body = opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body);
  const init: RequestInit = { method: opts.method ?? (opts.body === undefined ? "GET" : "POST"), body };
  const res = await authed((t) => send(path, init, t));
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? `HTTP_${res.status}`, data?.error?.message ?? `Request failed (${res.status})`);
  return data as T;
}

/**
 * POST that returns the raw Response for streaming. Uses expo/fetch, whose response.body is a real
 * ReadableStream on iOS/Android (React Native's global fetch buffers the whole body).
 */
export async function apiStream(path: string, body: unknown) {
  const res = await authed((t) =>
    expoFetch(BASE + path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", accept: "application/x-ndjson", ...(t ? { authorization: `Bearer ${t}` } : {}) } }),
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new ApiError(res.status, data?.error?.code ?? `HTTP_${res.status}`, data?.error?.message ?? `Request failed (${res.status})`);
  }
  return res;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** GET on mount and every time the screen regains focus. `path: null` skips the call. */
export function useApi<T>(path: string | null) {
  const [s, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: !!path });
  const reload = useCallback(async () => {
    if (!path) return;
    set((p) => ({ ...p, loading: true }));
    try {
      set({ data: await api<T>(path), loading: false });
    } catch (e) {
      set((p) => ({ ...p, error: errorMessage(e), loading: false }));
    }
  }, [path]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { ...s, reload };
}

// Response shapes of the /api/v1 routes the app uses (server returns Prisma rows as JSON).
export type Punch = { id: string; at: string; direction: "IN" | "OUT" | null; method: PunchMethod; source: string };
export type Today = { day?: string; clockedIn: boolean; shift?: { name: string; startTime: string; endTime: string }; punches: Punch[] };
export type Dtr = { month: string; rows: DtrRow[]; totals: DtrTotals | null; timeZone?: string };
export type LeaveItem = {
  id: string;
  startDate: string;
  endDate: string;
  totalDays: string;
  reason: string | null;
  status: LeaveStatus;
  decisionNote: string | null;
  leaveType: { id: string; name: string; color: string };
  employee: { firstName: string; lastName: string; preferredName: string | null; department: { name: string } | null };
};

export type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "ACTIVE" | "PAID";
type Person = { firstName: string; lastName: string; preferredName: string | null; department: { name: string } | null };
type Base = { id: string; status: Status; createdAt: string; employee?: Person };
export type Overtime = Base & { date: string; startTime: string; endTime: string; minutes: number; reason: string; decisionNote: string | null };
export type Coe = Base & { purpose: string; includeCompensation: boolean; note: string | null };
export type Expense = Base & { date: string; category: string; amount: string; description: string; receiptId: string | null; decisionNote: string | null; reimbursedIn: { name: string } | null };
export type Loan = Base & { type: string; principal: string; amortization: string; balance: string; startDate: string; reason: string | null };
export type RequestLists = { overtime: Overtime[]; coe: Coe[]; expenses: Expense[]; loans: Loan[] };

export type Correction = Base & { date: string; kind: CorrectionInput["kind"]; inTime: string | null; outTime: string | null; reason: string; decisionNote: string | null };

export type PayslipLine = { kind: "earning" | "deduction" | "info"; code: string; label: string; amount: number; qty?: number };
export type Payslip = {
  id: string;
  run: { id: string; name: string; kind: string; status: string; periodStart: string; periodEnd: string; payDate: string };
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  lines?: PayslipLine[];
  ytd?: { gross: number; tax: number; net: number };
};

type ShiftLite = { id: string; name: string; startTime: string; endTime: string };
export type ScheduleDay = { date: string; shift: ShiftLite | null; override: boolean; base: ShiftLite | null; holiday: { name: string; type: string } | null };

export type Announcement = { id: string; title: string; body: string; pinned: boolean; requiresAck: boolean; publishedAt: string; author: string | null; ackedAt: string | null };
export type Survey = { id: string; title: string; description: string | null; anonymous: boolean; closesAt: string | null; questions: SurveyQuestion[]; answered: boolean };
