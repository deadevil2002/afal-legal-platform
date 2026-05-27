import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  User,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";

type Lang = "en" | "ar";

function applyLanguage(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  localStorage.setItem("af_dashboard_lang", lang);
}

export default function Settings() {
  const { user, profile, isSuperAdmin, updateMyProfile, transferSuperAdmin } = useAuth();

  // ─── Language ──────────────────────────────────────────────────────────────
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem("af_dashboard_lang") as Lang) || "en";
  });

  const handleLangChange = (next: Lang) => {
    setLang(next);
    applyLanguage(next);
  };

  useEffect(() => {
    applyLanguage(lang);
  }, []);

  // ─── Profile edit ─────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [department, setDepartment] = useState(profile?.department || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setPhone(profile.phone || "");
      setDepartment(profile.department || "");
    }
  }, [profile]);

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileError("");
    setProfileSuccess(false);
    try {
      await updateMyProfile({ displayName, phone, department });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  // ─── Super Admin Transfer ─────────────────────────────────────────────────
  const [transferEmail, setTransferEmail] = useState("");
  const [transferPassword, setTransferPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState(false);

  const handleTransfer = async () => {
    if (!transferEmail.trim() || !transferPassword) {
      setTransferError("Both target email and your current password are required.");
      return;
    }
    setTransferring(true);
    setTransferError("");
    try {
      await transferSuperAdmin(transferEmail.trim(), transferPassword);
      setTransferSuccess(true);
      setTransferEmail("");
      setTransferPassword("");
      setShowConfirm(false);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Transfer failed. Please try again.");
    } finally {
      setTransferring(false);
    }
  };

  const t = lang === "ar"
    ? {
        title: "الإعدادات",
        subtitle: "تفضيلات اللغة والملف الشخصي وإدارة المشرف",
        langTitle: "اللغة",
        langDesc: "اختر لغة لوحة التحكم",
        en: "English",
        ar: "العربية",
        profileTitle: "الملف الشخصي",
        profileDesc: "تعديل بيانات حسابك",
        nameLabel: "الاسم الكامل",
        phoneLabel: "رقم الهاتف",
        deptLabel: "القسم",
        empLabel: "رقم الموظف",
        emailLabel: "البريد الإلكتروني",
        saveBtn: "حفظ",
        saving: "جاري الحفظ...",
        saved: "تم الحفظ بنجاح",
        transferTitle: "نقل صلاحية المشرف الأعلى",
        transferDesc: "انقل صلاحية المشرف الأعلى إلى مستخدم مسجل آخر. هذا الإجراء غير قابل للتراجع.",
        targetEmail: "البريد الإلكتروني للمستخدم الجديد",
        currentPass: "كلمة مرورك الحالية",
        confirmBtn: "تأكيد النقل",
        cancelBtn: "إلغاء",
        transferBtn: "نقل الصلاحية",
      }
    : {
        title: "Settings",
        subtitle: "Language preferences, profile, and admin management",
        langTitle: "Language",
        langDesc: "Choose the dashboard display language",
        en: "English",
        ar: "Arabic (العربية)",
        profileTitle: "Profile",
        profileDesc: "Edit your account information",
        nameLabel: "Full Name",
        phoneLabel: "Phone Number",
        deptLabel: "Department",
        empLabel: "Employee Number",
        emailLabel: "Email",
        saveBtn: "Save Changes",
        saving: "Saving…",
        saved: "Saved successfully",
        transferTitle: "Transfer Super Admin",
        transferDesc: "Transfer Super Admin ownership to another registered user. This action is irreversible and writes an audit log.",
        targetEmail: "Target user email",
        currentPass: "Your current password",
        confirmBtn: "Confirm Transfer",
        cancelBtn: "Cancel",
        transferBtn: "Initiate Transfer",
      };

  return (
    <Layout>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-1">{t.subtitle}</p>
        </div>

        {/* ── Language ────────────────────────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <CardTitle>{t.langTitle}</CardTitle>
            </div>
            <CardDescription>{t.langDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {(["en", "ar"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => handleLangChange(l)}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                    lang === l
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-muted hover:border-primary/40"
                  }`}
                >
                  {l === "en" ? t.en : t.ar}
                  {lang === l && (
                    <Badge className="ml-2 bg-primary/10 text-primary text-xs">Active</Badge>
                  )}
                </button>
              ))}
            </div>
            {lang === "ar" && (
              <p className="mt-3 text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded px-3 py-2">
                ✓ RTL layout enabled — page direction switched to right-to-left.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Profile edit ─────────────────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              <CardTitle>{t.profileTitle}</CardTitle>
            </div>
            <CardDescription>{t.profileDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Read-only fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t.emailLabel}</label>
                <input
                  readOnly
                  value={user?.email || ""}
                  className="w-full px-3 py-2 rounded-md border bg-muted/40 text-muted-foreground text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t.empLabel}</label>
                <input
                  readOnly
                  value={profile?.employeeNumber || "—"}
                  className="w-full px-3 py-2 rounded-md border bg-muted/40 text-muted-foreground text-sm cursor-not-allowed"
                />
              </div>
            </div>

            {/* Editable fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t.nameLabel}</label>
                {!profile ? <Skeleton className="h-9 w-full" /> : (
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t.deptLabel}</label>
                {!profile ? <Skeleton className="h-9 w-full" /> : (
                  <input
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t.phoneLabel}</label>
                {!profile ? <Skeleton className="h-9 w-full" /> : (
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    type="tel"
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    dir="ltr"
                  />
                )}
              </div>
            </div>

            {profileError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{profileError}</p>
            )}
            {profileSuccess && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> {t.saved}
              </p>
            )}

            <button
              onClick={saveProfile}
              disabled={profileSaving || !profile}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {profileSaving ? t.saving : t.saveBtn}
            </button>
          </CardContent>
        </Card>

        {/* ── Super Admin Transfer ─────────────────────────────────────────── */}
        {isSuperAdmin && (
          <Card className="shadow-sm border-amber-200">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-accent" />
                <CardTitle>{t.transferTitle}</CardTitle>
              </div>
              <CardDescription>{t.transferDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {transferSuccess ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Transfer Complete</p>
                    <p className="text-sm mt-1">Super Admin has been transferred. You have been downgraded to assistant admin and will be redirected shortly.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      You will lose Super Admin access immediately after transfer. An audit log entry will be written to Firestore.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">{t.targetEmail}</label>
                      <input
                        type="email"
                        value={transferEmail}
                        onChange={e => setTransferEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">{t.currentPass}</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={transferPassword}
                          onChange={e => setTransferPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 pr-10 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {transferError && (
                    <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{transferError}</p>
                  )}

                  {!showConfirm ? (
                    <button
                      onClick={() => {
                        if (!transferEmail.trim() || !transferPassword) {
                          setTransferError("Both fields are required before confirming.");
                          return;
                        }
                        setTransferError("");
                        setShowConfirm(true);
                      }}
                      className="px-5 py-2 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600 transition-colors"
                    >
                      {t.transferBtn}
                    </button>
                  ) : (
                    <div className="p-4 border-2 border-destructive/30 rounded-lg bg-destructive/5 space-y-3">
                      <p className="text-sm font-semibold text-destructive">
                        Confirm: Transfer Super Admin to <span className="font-mono">{transferEmail}</span>?
                      </p>
                      <p className="text-xs text-muted-foreground">This cannot be undone. You will lose access immediately.</p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleTransfer}
                          disabled={transferring}
                          className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          {transferring ? "Transferring…" : t.confirmBtn}
                        </button>
                        <button
                          onClick={() => { setShowConfirm(false); setTransferError(""); }}
                          className="px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors"
                        >
                          {t.cancelBtn}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
