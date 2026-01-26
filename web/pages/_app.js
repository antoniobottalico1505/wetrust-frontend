import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { getSession, clearSession } from "../lib/session";

export const AuthContext = createContext(null);

function readTokenSafe() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("wetrust_token") || localStorage.getItem("token");
  } catch {
    return null;
  }
}

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    // ✅ Se non c'è token, NON chiamare /me (evita 401 e “sembra rotto”)
    const token = readTokenSafe();
    if (!token) {
      setUser(null);
      return null;
    }

    try {
      const data = await apiFetch("/me"); // apiFetch aggiunge Authorization automaticamente se token c'è
      if (data?.user) {
        setUser(data.user);
        return data.user;
      }

      // fallback: se hai user salvato localmente
      const sess = getSession?.();
      const sessionUser = sess?.user || sess?.user_id || null;
      setUser(sessionUser || null);
      return sessionUser || null;
    } catch (e) {
      // ✅ Se token non valido / scaduto -> pulisci sessione
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
    // compat: array + proprietà
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
