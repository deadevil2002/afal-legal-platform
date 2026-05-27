import { useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { updateUser } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, AlertCircle, RefreshCw, Pencil, UserX, UserCheck, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS, ROLE_COLORS, type AnyUserRole, type UserProfile } from "@/types";

const EDITABLE_ROLES: AnyUserRole[] = ["ceo", "evp", "operations", "planning", "finance", "procurement", "assistant_admin"];

export default function Users() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Edit modal state
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", phone: "", department: "", employeeNumber: "", role: "", canSubmitRequests: false });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  // Deactivate modal state
  const [deactivateTarget, setDeactivateTarget] = useState<UserProfile | null>(null);
  const [deactivateSaving, setDeactivateSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");
      const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(200)));
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    } catch (err) {
      console.error("Error loading users:", err);
      setError("Failed to load users from the database. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          u.displayName?.toLowerCase().includes(term) ||
          u.fullName?.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term) ||
          u.employeeNumber?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [users, searchTerm, roleFilter]);

  const openEdit = (u: UserProfile) => {
    setEditUser(u);
    setEditForm({
      displayName: u.displayName || u.fullName || "",
      phone: u.phone || "",
      department: u.department || "",
      employeeNumber: u.employeeNumber || "",
      role: u.role || "procurement",
      canSubmitRequests: u.canSubmitRequests ?? false,
    });
    setEditError("");
    setEditSuccess("");
  };

  const closeEdit = () => { setEditUser(null); setEditError(""); setEditSuccess(""); };

  const saveEdit = async () => {
    if (!editUser) return;
    if (editUser.uid === user?.uid && editForm.role !== "super_admin") {
      if (!window.confirm(t("users.selfRoleWarning"))) return;
    }
    setEditSaving(true);
    setEditError("");
    setEditSuccess("");
    try {
      await updateUser(editUser.uid, {
        displayName: editForm.displayName || undefined,
        phone: editForm.phone || undefined,
        department: editForm.department || undefined,
        employeeNumber: editForm.employeeNumber || undefined,
        role: editForm.role as AnyUserRole || undefined,
        canSubmitRequests: editForm.canSubmitRequests,
      });
      setUsers(prev => prev.map(u =>
        u.uid === editUser.uid
          ? { ...u, displayName: editForm.displayName, phone: editForm.phone, department: editForm.department, employeeNumber: editForm.employeeNumber, role: editForm.role as AnyUserRole, canSubmitRequests: editForm.canSubmitRequests }
          : u
      ));
      setEditSuccess(t("users.saved"));
      setTimeout(closeEdit, 1200);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleActive = async (target: UserProfile) => {
    setDeactivateSaving(true);
    try {
      const newActive = !(target.isActive !== false);
      await updateUser(target.uid, { isActive: newActive });
      setUsers(prev => prev.map(u => u.uid === target.uid ? { ...u, isActive: newActive } : u));
      showToast(newActive ? t("users.activated") : t("users.deactivated"));
      setDeactivateTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Operation failed.");
    } finally {
      setDeactivateSaving(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("users.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("users.subtitle")}</p>
          </div>
          <button
            onClick={loadUsers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-secondary/10 text-secondary hover:bg-secondary/20 rounded-md text-sm font-medium transition-colors w-fit"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("users.refresh")}
          </button>
        </div>

        {/* Toast */}
        {toastMsg && (
          <div className="fixed bottom-6 end-6 z-50 flex items-center gap-2 px-4 py-3 bg-green-700 text-white rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-bottom-4">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {toastMsg}
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-destructive text-sm font-medium">{error}</p>
          </div>
        )}

        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t("users.search")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="ps-9 w-full"
                  data-testid="input-search-users"
                />
              </div>
              <div className="w-full sm:w-[200px]">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger data-testid="select-role-filter">
                    <SelectValue placeholder={t("users.filterByRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("users.allRoles")}</SelectItem>
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <SelectItem key={role} value={role}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>{t("users.colName")}</TableHead>
                    <TableHead>{t("users.colEmployeeNo")}</TableHead>
                    <TableHead>{t("users.colRole")}</TableHead>
                    <TableHead>{t("users.colDepartment")}</TableHead>
                    <TableHead>{t("users.colStatus")}</TableHead>
                    <TableHead className="text-end">{t("users.colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => (
                      <TableRow key={u.uid} className="hover:bg-muted/20">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{u.fullName || u.displayName || "—"}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono text-muted-foreground">{u.employeeNumber || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <RoleBadge role={u.role} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.department || "—"}</TableCell>
                        <TableCell>
                          {u.isActive !== false ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{t("users.statusActive")}</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{t("users.statusInactive")}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(u)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                              title={t("users.edit")}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              {t("users.edit")}
                            </button>
                            {u.uid !== user?.uid && (
                              <button
                                onClick={() => setDeactivateTarget(u)}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                                  u.isActive !== false
                                    ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                    : "bg-green-50 text-green-700 hover:bg-green-100"
                                }`}
                                title={u.isActive !== false ? t("users.deactivate") : t("users.activate")}
                              >
                                {u.isActive !== false
                                  ? <><UserX className="w-3.5 h-3.5" />{t("users.deactivate")}</>
                                  : <><UserCheck className="w-3.5 h-3.5" />{t("users.activate")}</>
                                }
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                        {t("users.noUsers")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {!loading && (
              <div className="mt-4 text-sm text-muted-foreground">
                {t("users.showing")} {filteredUsers.length} {t("users.of")} {users.length} {t("users.usersLabel")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t("users.editUser")}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{editUser.email}</p>
              </div>
              <button onClick={closeEdit} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("users.displayName")}</label>
                  <input
                    value={editForm.displayName}
                    onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("users.employeeNo")}</label>
                  <input
                    value={editForm.employeeNumber}
                    onChange={e => setEditForm(f => ({ ...f, employeeNumber: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("users.phone")}</label>
                  <input
                    value={editForm.phone}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    type="tel"
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("users.department")}</label>
                  <input
                    value={editForm.department}
                    onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t("users.roleLabel")}</label>
                <select
                  value={editForm.role}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {EDITABLE_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={editForm.canSubmitRequests}
                    onChange={e => setEditForm(f => ({ ...f, canSubmitRequests: e.target.checked }))}
                  />
                  <div className={`w-10 h-6 rounded-full transition-colors ${editForm.canSubmitRequests ? "bg-primary" : "bg-muted"}`} />
                  <div className={`absolute top-1 start-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${editForm.canSubmitRequests ? "translate-x-4" : ""}`} />
                </div>
                <span className="text-sm font-medium">{t("users.canSubmitRequests")}</span>
              </label>

              {editError && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{editError}</p>
              )}
              {editSuccess && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {editSuccess}
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={closeEdit}
                className="px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors"
              >
                {t("users.cancel")}
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {editSaving ? t("users.saving") : t("users.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate Confirm Modal ────────────────────────────────────────── */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b">
              <h2 className="text-lg font-semibold">
                {deactivateTarget.isActive !== false ? t("users.confirmDeactivate") : t("users.activate")}
              </h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-muted-foreground">{t("users.deactivateWarning")}</p>
              <p className="mt-3 font-medium text-sm">{deactivateTarget.fullName || deactivateTarget.displayName || deactivateTarget.email}</p>
              <p className="text-xs text-muted-foreground">{deactivateTarget.email}</p>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setDeactivateTarget(null)}
                className="px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors"
              >
                {t("users.cancel")}
              </button>
              <button
                onClick={() => void toggleActive(deactivateTarget)}
                disabled={deactivateSaving}
                className={`px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 transition-opacity ${
                  deactivateTarget.isActive !== false ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {deactivateSaving ? "…" : t("users.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function RoleBadge({ role }: { role: AnyUserRole }) {
  const label = ROLE_LABELS[role] || role;
  const color = ROLE_COLORS[role] || "#9CA3AF";
  return (
    <div
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border"
      style={{ backgroundColor: `${color}15`, color, borderColor: `${color}30` }}
    >
      {label}
    </div>
  );
}
