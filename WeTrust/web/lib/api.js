import { getToken } from "./session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // Content-Type solo se c'è body
  const hasBody = opts.body !== undefined && opts.body !== null;
  if (hasBody && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  let data = {};
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json();
  else data = { message: await res.text() };

  if (!res.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Errore API (${res.status})`);
  }

  return data;
}

export { API_BASE };
