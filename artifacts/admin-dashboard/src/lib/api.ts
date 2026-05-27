const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export async function lookupEmployee(
  employeeNumber: string
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
