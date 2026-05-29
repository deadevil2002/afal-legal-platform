import { auth } from "@/lib/firebase";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/**
 * Cloudflare Worker base URL for admin user management routes (Phase 2D/2E).
 * Covers: POST /api/admin/users/lookup-employee, POST /api/admin/users, PATCH /api/admin/users/:uid
 *
 * Primary: VITE_CLOUDFLARE_API_URL env var → https://procurement-api.isaudi.ai
 * Emergency fallback: direct workers.dev URL (workers_dev = true in wrangler.toml keeps it live)
 * Replit fallback: swap CF_ADMIN_BASE → API_BASE in each function.
 */
const CF_ADMIN_BASE =
  ((import.meta.env.VITE_CLOUDFLARE_API_URL as string | undefined) ?? "").replace(/\/$/, "") ||
  "https://af-procurement-api.isaudi-official.workers.dev";

async function getIdToken(): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Not authenticated — no ID token available.");
  return token;
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(
      (json as { message?: string; error?: string }).message ||
      (json as { message?: string; error?: string }).error ||
      `Request failed with status ${res.status}`
    );
  }
  return json;
}

/**
 * Cloudflare Worker request helper — unwraps { ok, data } envelope.
 * Used for all three admin user routes.
 * On error, throws with the code field when present (e.g. "phone_taken") so callers
 * can match it, then falls back to the error string.
 */
async function cfAdminRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getIdToken();
  console.log(`[Cloudflare Admin API] ${method} ${path}`);
  const res = await fetch(`${CF_ADMIN_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { ok: boolean; data?: T; error?: string; code?: string };
  if (!res.ok) {
    throw new Error(json.code ?? json.error ?? `Request failed with status ${res.status}`);
  }
  return (json.data ?? json) as T;
}

export async function lookupEmployee(
  employeeNumber: string,
): Promise<{ email: string } | null> {
  try {
    console.log("[Cloudflare Admin API] POST /api/admin/users/lookup-employee");
    const res = await fetch(`${CF_ADMIN_BASE}/api/admin/users/lookup-employee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeNumber }),
    });
    if (!res.ok) return null;
    // CF Worker wraps response as { ok: true, data: { email } }
    const json = (await res.json()) as { ok?: boolean; data?: { email?: string } };
    const email = json.data?.email;
    return email ? { email } : null;
  } catch {
    return null;
  }
}

export interface CreateUserPayload {
  email: string;
  password: string;
  displayName: string;
  employeeNumber: string;
  phone: string;
  department?: string;
  role: string;
  canSubmitRequests: boolean;
}

export interface CreateUserResponse {
  uid: string;
  email: string;
  displayName: string;
  role: string;
}

export async function createUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  return cfAdminRequest<CreateUserResponse>("POST", "/api/admin/users", payload);
}

export interface UpdateUserPayload {
  displayName?: string;
  department?: string;
  role?: string;
  canSubmitRequests?: boolean;
  phone?: string;
  employeeNumber?: string;
  isActive?: boolean;
}

export interface UpdateUserResponse {
  uid: string;
  updated: string[];
}

export async function updateUser(uid: string, payload: UpdateUserPayload): Promise<UpdateUserResponse> {
  return cfAdminRequest<UpdateUserResponse>("PATCH", `/api/admin/users/${uid}`, payload);
}
