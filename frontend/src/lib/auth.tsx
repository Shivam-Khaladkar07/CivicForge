import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken } from "@/lib/api";

export type RoleId =
  | "citizen"
  | "government"
  | "university_admin"
  | "faculty"
  | "student"
  | "industry"
  | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role_id: RoleId;
  is_demo: boolean;
}

interface AuthState {
  user: User | null;
  permissions: string[];
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: { email: string; password: string; full_name: string; district?: string }) => Promise<User>;
  logout: () => void;
  has: (perm: string) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api<{ user: User; permissions: string[] }>("/api/auth/me");
      setUser(me.user);
      setPermissions(me.permissions);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      permissions,
      loading,
      async login(email, password) {
        const res = await api<{ token: string; user: User }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setToken(res.token);
        setUser(res.user);
        const me = await api<{ permissions: string[] }>("/api/auth/me");
        setPermissions(me.permissions);
        return res.user;
      },
      async register(payload) {
        const res = await api<{ token: string; user: User }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setToken(res.token);
        setUser(res.user);
        const me = await api<{ permissions: string[] }>("/api/auth/me");
        setPermissions(me.permissions);
        return res.user;
      },
      logout() {
        clearToken();
        setUser(null);
        setPermissions([]);
      },
      has: (perm) => permissions.includes(perm) || user?.role_id === "admin",
    }),
    [user, permissions, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth");
  return ctx;
}
