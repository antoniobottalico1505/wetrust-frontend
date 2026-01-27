// web/lib/api.js

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  ""; // se vuoto, usa chiamate relative (utile con rewrites/proxy)

function isAbsoluteUrl(u) {
  return /^https?:\/\//i.test(u);
}

function joinUrl(base, path) {
  if (!base) return path;
  if (isAbsoluteUrl(path)) return path;

  const b = String(base).replace(/\/+$/, "");
  const p = String(path).startsWith("/") ? String(path) : `/${path}`;
  return `${b}${p}`;
}

function isPlainObject(x) {
  return (
    x !== null &&
    typeof x === "object" &&
    (x.constructor === Object || Object.getPrototypeOf(x) === Object.prototype)
  );
}

function buildErrorMessage(res, dataOrText) {
  const fromBody =
    (dataOrText && typeof dataOrText === "object" && (dataOrText.error || dataOrText.message)) ||
    (typeof dataOrText === "string" ? dataOrText : "");

  const base = fromBody ? String(fromBody) : `HTTP ${res.status}`;
  return `${base}`;
}

/**
 * apiFetch("/path", { method, headers, body })
 * - body: se è oggetto plain => JSON.stringify automatico + content-type json
 * - se res 204 => { ok: true }
 * - se non ok => throw Error(...)
 */
export async function apiFetch(path, options = {}) {
  const url = joinUrl(API_BASE, path);

  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };

  // Body handling
  let body = options.body;

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  const isBlob =
    typeof Blob !== "undefined" && body instanceof Blob;

  if (body !== undefined && body !== null && isPlainObject(body)) {
    // Se è un oggetto plain lo serializzo in JSON
    body = JSON.stringify(body);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  // Se body è stringa e non ho content-type, assumo json solo se sembra json
  if (
    typeof body === "string" &&
    !headers["Content-Type"] &&
    !headers["content-type"] &&
    (body.trim().startsWith("{") || body.trim().startsWith("["))
  ) {
    headers["Content-Type"] = "application/json";
  }

  // Accetto JSON di default
  if (!headers.Accept && !headers.accept) {
    headers.Accept = "application/json, text/plain;q=0.9, */*;q=0.8";
  }

  const fetchOpts = {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : body,
    // puoi aggiungere credentials: "include" se ti serve cookie-auth
    signal: options.signal,
  };

  let res;
  try {
    res = await fetch(url, fetchOpts);
  } catch (err) {
    throw new Error(err?.message || "Network error");
  }

  // 204 No Content
  if (res.status === 204) return { ok: true };

  const ct = (res.headers.get("content-type") || "").toLowerCase();

  let data = null;
  let text = "";

  try {
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      text = await res.text();
      data = text;
    }
  } catch {
    // se parsing fallisce, prova a leggere come testo
    try {
      text = await res.text();
      data = text;
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg = buildErrorMessage(res, data);
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  // Se json null ma ok, ritorna ok
  return data ?? { ok: true };
}
