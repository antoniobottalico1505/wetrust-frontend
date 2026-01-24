// lib/api.js

// 1) Base URL: se non è settata una env "public", in produzione su Vercel
// conviene usare un proxy same-origin: /api  (con rewrites in vercel.json)
const ENV_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.REACT_APP_API_URL ||
  process.env.VITE_API_URL ||
  "";

// Fallback ragionato:
// - Browser: /api (così chiami https://tuosito.vercel.app/api/... e Vercel fa proxy verso Render)
// - SSR (se mai servisse): fallback al tuo dominio legacy
const API_BASE =
  ENV_BASE ||
  (typeof window !== "undefined" ? "/api" : "https://wetrust-frontend.onrender.com/");

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
  let p = String(path || "");
  p = p.startsWith("/") ? p : `/${p}`;

  // Evita doppio /api se base finisce con /api e path inizia con /api/...
  if (/\/api$/i.test(b) && /^\/api(\/|$)/i.test(p)) {
    p = p.replace(/^\/api/i, "");
    if (!p.startsWith("/")) p = `/${p}`;
  }

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
  } else if (
    typeof body === "string" &&
    !isFormData &&
    !headers["Content-Type"]
  ) {
    // Se passi JSON.stringify(...) ma ti dimentichi l'header:
    const t = body.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      headers["Content-Type"] = "application/json";
    }
  }

  const url =
    typeof path === "string" && path.startsWith("http")
      ? path
      : joinUrl(API_BASE, path);

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
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
    throw new Error(
      `Impossibile raggiungere l’API (Failed to fetch). URL: ${url} — controlla API_BASE, HTTPS e CORS.`
    );
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
      (data && (data.error || data.message)) || `Errore API (${res.status})`;
    throw new Error(msg);
  }

  return data ?? { ok: true };
}

export { API_BASE };

// compat: puoi usare sia apiFetch che api
export const api = apiFetch;

// compat extra: se da qualche parte fai `import api from "../lib/api"`
export default apiFetch;
