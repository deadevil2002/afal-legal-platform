import { getIdToken } from "firebase/auth";
import { auth } from "./firebase";

// The API base URL must point to the root domain (without /api suffix).
// In Replit development, set EXPO_PUBLIC_API_BASE_URL to the full https root URL.
// In production the app and api-server share the same domain so it can be empty.
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

async function getBearerToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  try {
    return await getIdToken(currentUser, false);
  } catch {
    return null;
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getBearerToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

// All server routes use safeJsonResponse which wraps payloads as:
//   { ok: true, data: T }
// This helper unwraps that envelope so callers always receive T directly.
function unwrapEnvelope<T>(json: unknown): T {
  if (
    json !== null &&
    typeof json === "object" &&
    "ok" in (json as object) &&
    "data" in (json as object)
  ) {
    return (json as { ok: boolean; data: T }).data;
  }
  return json as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: "GET" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return unwrapEnvelope<T>(json);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body2 = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body2.error ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return unwrapEnvelope<T>(json);
}
