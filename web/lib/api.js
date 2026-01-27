// web/lib/api.js

// 1) Base URL:
// - Se NEXT_PUBLIC_API_URL è settata => usa quella (es. https://...onrender.com o "/api")
// - Altrimenti in browser usa "/api" (proxy same-origin su Vercel tramite rewrites)
// - In SSR fallback al tuo Render (meglio di niente)
const ENV_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.REACT_APP_API_URL ||
  process.env.VITE_API_URL ||
  "";

const FALLBACK_RENDER_API = "https://wetrust-frontend.onrender.com"; // <-- il tuo backend Render

const API_BASE =
  ENV_BASE ||
  (typeof window !== "undefined"
    ? window.location.hostname.endsWith("wetrust.club")
      ? FALLBACK_RENDER_API
      : "/api"
    : FALLBACK_RENDER_API);

// --- Token helpers (usati per Stripe onboarding + tutte le API protette) ---
function readToken() {
  if (typeof window === "undefined") return null;
  try {
    return (
      localStorage.getItem("wetrust_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("accessToken") ||
      sessionStorage.getItem("wetrust_token") ||
      sessionStorage.getItem("token") ||
      sessionStorage.getItem("access_token") ||
      sessionStorage.getItem("accessToken")
    );
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

function headersToObject(h) {
  // Supporta sia plain object sia Headers
  if (!h) return {};
  if (typeof Headers !== "undefined" && h instanceof Headers) {
    const obj = {};
    for (const [k, v] of h.entries()) obj[k] = v;
    return obj;
  }
  return { ...h };
}

export async function apiFetch(path, opts = {}) {
  // opts.auth === false => NON aggiunge Authorization
  const { auth = true, timeoutMs = 30000, ...fetchOpts } = opts;

  const headers = headersToObject(fetchOpts.headers);

<<<<<<< HEAD
  // Aggiunge token se disponibile (serve per /stripe/connect/onboard e per le API protette)
  if (auth !== false) {
    const token = readToken();
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
=======
  // Aggiunge token se disponibile
  if (auth !== false) {
    const token = readToken();
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
>>>>>>> a7c1c41 (Integrate Stripe onboarding + payments flow)
  }

  // Body
  let body = fetchOpts.body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  // Normalizza Content-Type se passi oggetti / JSON
  if (isPlainObject(body) || Array.isArray(body)) {
    body = JSON.stringify(body);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  } else if (body != null && !isFormData && typeof body === "object") {
    body = JSON.stringify(body);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  } else if (
    typeof body === "string" &&
    !isFormData &&
    !headers["Content-Type"] &&
    !headers["content-type"]
  ) {
    const t = body.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      headers["Content-Type"] = "application/json";
    }
  }

  // Per GET/HEAD, evita body
  const method = (fetchOpts.method || "GET").toUpperCase();
  if ((method === "GET" || method === "HEAD") && body != null) {
    body = undefined;
  }

  const url =
    typeof path === "string" && path.startsWith("http")
      ? path
      : joinUrl(API_BASE, path);

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
<<<<<<< HEAD
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
=======
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
>>>>>>> a7c1c41 (Integrate Stripe onboarding + payments flow)

  let res;
  try {
    res = await fetch(url, {
      ...fetchOpts,
      method,
      body,
      headers,
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    const aborted =
<<<<<<< HEAD
      controller &&
      e &&
      (e.name === "AbortError" || String(e).includes("AbortError"));
=======
      controller && e && (e.name === "AbortError" || String(e).includes("AbortError"));
>>>>>>> a7c1c41 (Integrate Stripe onboarding + payments flow)
    throw new Error(
      aborted
        ? `Timeout API dopo ${timeoutMs}ms. URL: ${url}`
        : `Impossibile raggiungere l’API (Failed to fetch). URL: ${url} — controlla API_BASE, HTTPS e CORS.`
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  // 204 No Content
  if (res.status === 204) return { ok: true };

  const ct = (res.headers.get("content-type") || "").toLowerCase();

  let data = null;
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

  // Errore: status non ok, oppure payload {ok:false}
  if (!res.ok || (data && data.ok === false)) {
<<<<<<< HEAD
    const msg =
      (data && (data.error || data.message)) || `Errore API (${res.status})`;

=======
    const msg = (data && (data.error || data.message)) || `Errore API (${res.status})`;
>>>>>>> a7c1c41 (Integrate Stripe onboarding + payments flow)
    const err = new Error(msg);
    err.status = res.status;
    err.url = url;
    err.data = data;
    throw err;
  }

  return data ?? { ok: true };
}

// opzionale: se in qualche file vuoi chiamare esplicitamente "auth"
export function apiAuthFetch(path, opts = {}) {
  return apiFetch(path, { ...opts, auth: true });
}

export { API_BASE };

// compat: puoi usare sia apiFetch che api
export const api = apiFetch;

// compat extra: se da qualche parte fai `import api from "../lib/api"`
export default apiFetch;
