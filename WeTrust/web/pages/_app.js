import { createContext, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { getSession, clearSession } from "../lib/session";

export const AuthContext = createContext(null);

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    async function refresh() {
      try {
        // Se non c'è token, apiFetch fallirà e finiamo nel catch.
        const data = await apiFetch("/me");

        if (!alive) return;

        if (data?.user) {
          setUser(data.user);
        } else {
          // fallback se hai una session salvata
          setUser(getSession());
        }
      } catch {
        if (!alive) return;
        clearSession();
        setUser(null);
      } finally {
        if (!alive) return;
        setReady(true);
      }
    }

    refresh();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={[user, setUser, ready]}>
      <Component {...pageProps} />
    </AuthContext.Provider>
  );
}
