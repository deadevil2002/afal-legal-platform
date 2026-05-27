import { auth } from "@/lib/firebase";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

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

export async function lookupEmployee(
  employeeNumber: string,
): Promise<{ email: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/users/lookup-employee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeNumber }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ? { email: data.email } : null;
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
  return apiRequest<CreateUserResponse>("POST", "/api/admin/users", payload);
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
  return apiRequest<UpdateUserResponse>("PATCH", `/api/admin/users/${uid}`, payload);
}
