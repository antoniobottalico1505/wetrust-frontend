import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { getSession, clearSession } from "../lib/session";

export const AuthContext = createContext(null);

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // Se non c'è token, apiFetch fallirà e finiamo nel catch.
      const data = await apiFetch("/me");

      if (data?.user) {
        setUser(data.user);
        return data.user;
      }

      // fallback se hai una session salvata
      const sessionUser = getSession();
      setUser(sessionUser || null);
      return sessionUser || null;
    } catch {
      clearSession();
      setUser(null);
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    if (typeof window !== "undefined") window.location.href = "/login";
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      await refresh();
      if (alive) setReady(true);
    })();

    return () => {
      alive = false;
    };
  }, [refresh]);

  const authValue = useMemo(() => {
    // Manteniamo compatibilità: array + proprietà
    const v = [user, setUser, ready];

    v.user = user;
    v.setUser = setUser;
    v.ready = ready;

    v.refresh = refresh;
    v.logout = logout;

    return v;
  }, [user, ready, refresh, logout]);

  return (
    <AuthContext.Provider value={authValue}>
      <Component {...pageProps} />
    </AuthContext.Provider>
  );
}
