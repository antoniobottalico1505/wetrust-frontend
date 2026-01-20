const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.REACT_APP_API_URL ||
  process.env.VITE_API_URL ||
  "https://api.wetrust.club"; // <-- niente localhost in produzione

function readToken() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("wetrust_token");
  } catch {
    return null;
  }
}

function isPlainObject(x) {
  return x !== null && typeof x === "object" && x.constructor === Object;
}

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").startsWith("/") ? String(path || "") : `/${path || ""}`;
  return `${b}${p}`;
}

export async function apiFetch(path, opts = {}) {
  // opts.auth === false => NON aggiunge Authorization
  const { auth, timeoutMs = 30000, ...fetchOpts } = opts;

  const headers = { ...(fetchOpts.headers || {}) };

  const token = readToken();
  if (auth !== false && token) headers.Authorization = `Bearer ${token}`;

  // Body
  let body = fetchOpts.body;

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  // Se body è un plain object o array, lo trasformo in JSON automaticamente
  if (isPlainObject(body) || Array.isArray(body)) {
    body = JSON.stringify(body);
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  } else if (body != null && !isFormData && typeof body === "object") {
    // altri oggetti serializzabili
    body = JSON.stringify(body);
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  }

  const url =
    typeof path === "string" && path.startsWith("http")
      ? path
      : joinUrl(API_BASE, path);

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res;
  try {
    res = await fetch(url, {
      ...fetchOpts,
      body,
      headers,
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    // Tipico: CORS / mixed content / DNS / API down / timeout
    throw new Error("Impossibile raggiungere l’API (Failed to fetch). Controlla URL API, HTTPS e CORS.");
  } finally {
    if (t) clearTimeout(t);
  }

  // 204 No Content
  if (res.status === 204) return { ok: true };

  const ct = (res.headers.get("content-type") || "").toLowerCase();

  let data;
  if (ct.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    const text = await res.text();
    data = text ? { message: text } : null;
  }

  if (!res.ok || (data && data.ok === false)) {
    const msg =
      (data && (data.error || data.message)) ||
      `Errore API (${res.status})`;
    throw new Error(msg);
  }

  return data ?? { ok: true };
}

export { API_BASE };

// compat: puoi usare sia apiFetch che api
export const api = apiFetch;

// compat extra: se da qualche parte fai `import api from "../lib/api"`
export default apiFetch;
