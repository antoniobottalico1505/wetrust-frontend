import { createContext, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { getToken, getSession, clearSession, setSession } from "../lib/session";

export const AuthContext = createContext(null);

export default function App({ Component, pageProps }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function refresh() {
      const t = getToken();
      if (!t) {
        setUser(null);
        setReady(true);
        return;
      }

      try {
        const data = await apiFetch("/me");
        if (data?.user) {
          setUser(data.user);
          setSession(t, data.user);
        } else {
          setUser(getSession());
        }
      } catch {
        clearSession();
        setUser(null);
      } finally {
        setReady(true);
      }
    }
    refresh();
  }, []);

  return (
    <AuthContext.Provider value={[user, setUser, ready]}>
      <Component {...pageProps} />
    </AuthContext.Provider>
  );
}
