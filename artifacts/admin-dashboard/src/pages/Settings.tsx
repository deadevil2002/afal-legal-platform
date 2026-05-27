import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { updateUser } from "@/lib/api";
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

export default function Settings() {
  const { user, profile, isSuperAdmin, transferSuperAdmin } = useAuth();
  const { lang, setLang, t } = useLanguage();

  // ─── Profile edit ──────────────────────────────────────────────────────────
  const [displayName,    setDisplayName]    = useState("");
  const [phone,          setPhone]          = useState("");
  const [department,     setDepartment]     = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [profileSaving,  setProfileSaving]  = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError,   setProfileError]   = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setPhone(profile.phone || "");
      setDepartment(profile.department || "");
      setEmployeeNumber(profile.employeeNumber || "");
    }
  }, [profile]);

  const saveProfile = async () => {
    if (!user || !profile) return;
    setProfileSaving(true);
    setProfileError("");
    setProfileSuccess(false);
    try {
      await updateUser(user.uid, {
        displayName:    displayName || undefined,
        phone:          phone || undefined,
        department:     department || undefined,
        employeeNumber: employeeNumber || undefined,
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  // ─── Super Admin Transfer ──────────────────────────────────────────────────
  const [transferEmail,    setTransferEmail]    = useState("");
  const [transferPassword, setTransferPassword] = useState("");
  const [showPassword,     setShowPassword]     = useState(false);
  const [showConfirm,      setShowConfirm]      = useState(false);
  const [transferring,     setTransferring]     = useState(false);
  const [transferError,    setTransferError]    = useState("");
  const [transferSuccess,  setTransferSuccess]  = useState(false);

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

  return (
    <Layout>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
        </div>

        {/* ── Language ────────────────────────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <CardTitle>{t("settings.language")}</CardTitle>
            </div>
            <CardDescription>{t("settings.languageDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {(["en", "ar"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                    lang === l
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-muted hover:border-primary/40"
                  }`}
                >
                  {l === "en" ? t("settings.english") : t("settings.arabic")}
                  {lang === l && (
                    <Badge className="ms-2 bg-primary/10 text-primary text-xs">{t("settings.activeLabel")}</Badge>
                  )}
                </button>
              ))}
            </div>
            {lang === "ar" && (
              <p className="mt-3 text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {t("settings.rtlNote")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Profile edit ─────────────────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              <CardTitle>{t("settings.profile")}</CardTitle>
            </div>
            <CardDescription>{t("settings.profileDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Read-only email */}
            <div>
              <label className="block text-sm font-medium mb-1">{t("settings.emailLabel")}</label>
              <input
                readOnly
                value={user?.email || ""}
                className="w-full px-3 py-2 rounded-md border bg-muted/40 text-muted-foreground text-sm cursor-not-allowed"
                dir="ltr"
              />
            </div>

            {/* Editable fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t("settings.displayName")}</label>
                {!profile ? <Skeleton className="h-9 w-full" /> : (
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("settings.employeeNo")}</label>
                {!profile ? <Skeleton className="h-9 w-full" /> : (
                  <input
                    value={employeeNumber}
                    onChange={e => setEmployeeNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    dir="ltr"
                    placeholder="e.g. EMP-001"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("settings.department")}</label>
                {!profile ? <Skeleton className="h-9 w-full" /> : (
                  <input
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("settings.phone")}</label>
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
                <CheckCircle2 className="w-4 h-4" /> {t("settings.saved")}
              </p>
            )}

            <button
              onClick={saveProfile}
              disabled={profileSaving || !profile}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {profileSaving ? t("settings.saving") : t("settings.save")}
            </button>
          </CardContent>
        </Card>

        {/* ── Super Admin Transfer ─────────────────────────────────────────── */}
        {isSuperAdmin && (
          <Card className="shadow-sm border-amber-200">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-accent" />
                <CardTitle>{t("settings.transfer")}</CardTitle>
              </div>
              <CardDescription>{t("settings.transferDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {transferSuccess ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{t("settings.transferComplete")}</p>
                    <p className="text-sm mt-1">{t("settings.transferCompleteDesc")}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">{t("settings.transferWarning")}</p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">{t("settings.targetEmail")}</label>
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
                      <label className="block text-sm font-medium mb-1">{t("settings.currentPass")}</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={transferPassword}
                          onChange={e => setTransferPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 pe-10 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                      {t("settings.initiate")}
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
                          {transferring ? "Transferring…" : t("settings.confirm")}
                        </button>
                        <button
                          onClick={() => { setShowConfirm(false); setTransferError(""); }}
                          className="px-4 py-2 border rounded-md text-sm hover:bg-muted transition-colors"
                        >
                          {t("settings.cancel")}
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
