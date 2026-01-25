// lib/session.js
const TOKEN_KEY = "wetrust_token";
const USER_KEY = "wetrust_user";

export function setSession(token, user) {
  if (typeof window === "undefined") return;

  // token
  localStorage.setItem(TOKEN_KEY, token);
  // compat (se da qualche parte leggi "token")
  localStorage.setItem("token", token);

  // user
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
}

export function getSession() {
  if (typeof window === "undefined") return { token: null, user: null };

  const token =
    localStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem("token");

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {}

  return { token, user };
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("token");
  localStorage.removeItem(USER_KEY);
}
