import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loginSchema, type SessionUser } from "@hris/shared";
import { api, loadUser, logout, saveSession, setSignedOutHandler } from "./api";
import { registerForPush, unregisterPush } from "./push";

type Auth = {
  user: SessionUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSignedOutHandler(() => setUser(null));
    loadUser()
      .then(setUser)
      .finally(() => setReady(true));
  }, []);

  // (Re)register this phone for push whenever someone is signed in; tokens can rotate between launches.
  useEffect(() => {
    if (user) void registerForPush();
  }, [user?.id]);

  async function signIn(email: string, password: string) {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check your email and password");
    const r = await api<{ accessToken: string; refreshToken: string; user: SessionUser }>("/auth/login", { body: parsed.data });
    await saveSession(r, r.user);
    setUser(r.user);
  }

  async function signOut() {
    await unregisterPush();
    await logout();
    setUser(null);
  }

  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAuth outside AuthProvider");
  return a;
}

export const isApprover = (u: SessionUser | null) => !!u && ["MANAGER", "HR", "ADMIN"].includes(u.role);
