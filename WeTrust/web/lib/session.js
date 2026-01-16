export function setSession(token, user) {
  if (typeof window === "undefined") return;
  localStorage.setItem("wetrust_token", token);
  localStorage.setItem("wetrust_user", JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("wetrust_token");
  localStorage.removeItem("wetrust_user");
}

export function getSession() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("wetrust_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("wetrust_token");
}
