import { useState } from "react";
import Layout from "@/components/Layout";
import { useLanguage } from "@/context/LanguageContext";
import { createUser } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, UserPlus } from "lucide-react";
import { ROLE_LABELS } from "@/types";
import type { AnyUserRole } from "@/types";

const CREATABLE_ROLES: AnyUserRole[] = ["ceo", "evp", "operations", "planning", "finance", "procurement", "assistant_admin"];

interface FormState {
  displayName: string;
  email: string;
  password: string;
  employeeNumber: string;
  phone: string;
  department: string;
  role: string;
  canSubmitRequests: boolean;
}

const EMPTY_FORM: FormState = {
  displayName: "",
  email: "",
  password: "",
  employeeNumber: "",
  phone: "",
  department: "",
  role: "procurement",
  canSubmitRequests: false,
};

export default function AddUser() {
  const { t } = useLanguage();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [successEmail, setSuccessEmail] = useState("");

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm(f => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessEmail("");

    // Basic validation
    if (!form.displayName.trim()) { setError("Full name is required."); return; }
    if (!form.email.trim())       { setError("Email is required."); return; }
    if (!form.password)           { setError("Password is required (min 8 chars)."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!form.employeeNumber.trim()) { setError("Employee number is required."); return; }
    if (!form.phone.trim())       { setError("Phone number is required."); return; }

    setCreating(true);
    try {
      await createUser({
        displayName:      form.displayName.trim(),
        email:            form.email.trim(),
        password:         form.password,
        employeeNumber:   form.employeeNumber.trim(),
        phone:            form.phone.trim(),
        department:       form.department.trim() || undefined,
        role:             form.role,
        canSubmitRequests: form.canSubmitRequests,
      });
      setSuccessEmail(form.email.trim());
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("addUser.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("addUser.subtitle")}</p>
        </div>

        {successEmail && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800">{t("addUser.success")}</p>
              <p className="text-xs text-green-700 mt-0.5 font-mono">{successEmail}</p>
            </div>
            <button
              onClick={() => setSuccessEmail("")}
              className="text-green-700 hover:text-green-900 text-sm font-medium shrink-0"
            >
              {t("addUser.resetForm")}
            </button>
          </div>
        )}

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              <CardTitle>{t("addUser.title")}</CardTitle>
            </div>
            <CardDescription>{t("addUser.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("addUser.displayName")} <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={form.displayName}
                    onChange={set("displayName")}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    autoComplete="off"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("addUser.email")} <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    dir="ltr"
                    autoComplete="off"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("addUser.password")} <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={set("password")}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    dir="ltr"
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>

                {/* Employee Number */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("addUser.employeeNo")} <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={form.employeeNumber}
                    onChange={set("employeeNumber")}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    dir="ltr"
                    placeholder="e.g. EMP-001"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("addUser.phone")} <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    dir="ltr"
                    placeholder="+966..."
                  />
                </div>

                {/* Department */}
                <div>
                  <label className="block text-sm font-medium mb-1">{t("addUser.department")}</label>
                  <input
                    value={form.department}
                    onChange={set("department")}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("addUser.role")} <span className="text-destructive">*</span>
                </label>
                <select
                  value={form.role}
                  onChange={set("role")}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {CREATABLE_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                  ))}
                </select>
              </div>

              {/* Can Submit Requests toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.canSubmitRequests}
                    onChange={e => setForm(f => ({ ...f, canSubmitRequests: e.target.checked }))}
                  />
                  <div className={`w-10 h-6 rounded-full transition-colors ${form.canSubmitRequests ? "bg-primary" : "bg-muted"}`} />
                  <div className={`absolute top-1 start-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.canSubmitRequests ? "translate-x-4" : ""}`} />
                </div>
                <span className="text-sm font-medium">{t("addUser.canSubmitRequests")}</span>
              </label>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  data-testid="button-create-user"
                >
                  <UserPlus className="w-4 h-4" />
                  {creating ? t("addUser.creating") : t("addUser.create")}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
