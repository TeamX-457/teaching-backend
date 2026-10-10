import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type AuthUser, type LangCfg } from "./api";
import { actions } from "./store";

/** Server session is the source of truth; the local store mirrors it for the public site header. */
export function useAuth(opts: { required?: boolean } = {}) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      try { return await api.auth.session(); } catch (e) {
        if (e instanceof ApiError && e.status === 0) throw e; // offline: do not log out
        return null;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  const user: AuthUser | null = q.data?.user ?? null;

  useEffect(() => {
    if (!q.isSuccess) return;
    if (user) actions.signIn({ name: user.name, email: user.email, role: user.role });
    else {
      actions.signOut();
      if (opts.required) navigate({ to: "/login" });
    }
  }, [q.isSuccess, user, opts.required, navigate]);

  return { user, loading: q.isPending, offline: q.isError };
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    try { await api.auth.signOut(); } catch { /* clear locally regardless */ }
    actions.signOut();
    qc.setQueryData(["session"], null);
    navigate({ to: "/" });
  };
}

export function useLanguages() {
  return useQuery({
    queryKey: ["languages"],
    queryFn: api.languages,
    staleTime: 10 * 60_000,
  });
}

export const findLang = (langs: LangCfg[] | undefined, code: string) => langs?.find((l) => l.code === code);
