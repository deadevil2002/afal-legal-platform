import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { translations } from "@/i18n/translations";

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = "en" | "ar";
type PaymentTerm = "advance" | "50_50" | "after_supply";
type LinkStatus = "active" | "expired" | "used" | "deactivated" | null;

interface FormState {
  companyName: string;
  commercialRegistrationNumber: string;
  accreditationNumber: string;
  zatcaNumber: string;
  phone: string;
  email: string;
  contactPersonName: string;
  nationalAddressText: string;
  ibanText: string;
  priceExcludingVatSar: string;
  paymentTerms: PaymentTerm | "";
  notes: string;
}

interface FormErrors {
  companyName?: string;
  commercialRegistrationNumber?: string;
  accreditationNumber?: string;
  zatcaNumber?: string;
  phone?: string;
  email?: string;
  contactPersonName?: string;
  nationalAddressText?: string;
  ibanText?: string;
  priceExcludingVatSar?: string;
  paymentTerms?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  primary: "#2D6491",
  secondary: "#16A8BA",
  accent: "#BC9B5D",
  background: "#F5F7FA",
  card: "#FFFFFF",
  foreground: "#000000",
  mutedForeground: "#6B7280",
  border: "#DDE3EC",
  muted: "#EEF1F5",
  success: "#16A34A",
  error: "#DC2626",
};

const VAT_RATE = 0.15;

const PAYMENT_OPTIONS: { value: PaymentTerm; labelKey: keyof typeof translations.en }[] = [
  { value: "advance",      labelKey: "paymentAdvance" },
  { value: "50_50",        labelKey: "payment50_50" },
  { value: "after_supply", labelKey: "paymentAfterSupply" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcVat(price: number): number {
  return Math.round(price * VAT_RATE * 100) / 100;
}
function calcTotal(price: number): number {
  return Math.round(price * (1 + VAT_RATE) * 100) / 100;
}
function formatSar(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, isRTL }: { title: string; isRTL: boolean }) {
  return (
    <View style={[sf.sectionHeader, isRTL && { flexDirection: "row-reverse" }]}>
      <View style={sf.sectionLine} />
      <Text style={[sf.sectionTitle, isRTL && { textAlign: "right" }]}>{title}</Text>
      <View style={sf.sectionLine} />
    </View>
  );
}

function Field({
  label,
  children,
  error,
  required,
  isRTL,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
  isRTL: boolean;
}) {
  return (
    <View style={sf.fieldWrap}>
      <View style={[sf.labelRow, isRTL && { flexDirection: "row-reverse" }]}>
        <Text style={[sf.label, isRTL && { textAlign: "right" }]}>{label}</Text>
        {required && <Text style={sf.required}>*</Text>}
      </View>
      {children}
      {error ? (
        <Text style={[sf.errorText, isRTL && { textAlign: "right" }]}>{error}</Text>
      ) : null}
    </View>
  );
}

function StyledInput({
  value,
  onChangeText,
  placeholder,
  isRTL,
  keyboardType,
  multiline,
  editable = true,
  hasError,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  isRTL: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  multiline?: boolean;
  editable?: boolean;
  hasError?: boolean;
}) {
  return (
    <TextInput
      style={[
        sf.input,
        isRTL && { textAlign: "right" },
        multiline && { height: 80, textAlignVertical: "top" },
        hasError && { borderColor: COLORS.error },
        !editable && { backgroundColor: COLORS.muted, color: COLORS.mutedForeground },
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.mutedForeground}
      keyboardType={keyboardType}
      multiline={multiline}
      editable={editable}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}

function PaymentTermSelector({
  value,
  onChange,
  options,
  isRTL,
  hasError,
}: {
  value: PaymentTerm | "";
  onChange: (v: PaymentTerm) => void;
  options: typeof PAYMENT_OPTIONS;
  isRTL: boolean;
  hasError?: boolean;
}) {
  return (
    <View style={[sf.paymentGrid, hasError && { borderColor: COLORS.error, borderWidth: 1, borderRadius: 10, padding: 2 }]}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[sf.paymentOption, active && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.8}
          >
            <Text style={[sf.paymentOptionText, isRTL && { textAlign: "center" }, active && { color: "#fff" }]}>
              {translations[isRTL ? "ar" : "en"][opt.labelKey] as string}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SupplierFormScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();

  const [lang, setLang] = useState<Lang>("en");
  const isRTL = lang === "ar";
  const t = useMemo(
    () => (key: keyof typeof translations.en) => translations[lang][key] as string,
    [lang]
  );

  const [linkStatus, setLinkStatus] = useState<LinkStatus>(null);
  const [linkLoading, setLinkLoading] = useState(true);
  const [supplierNameHint, setSupplierNameHint] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    companyName: "",
    commercialRegistrationNumber: "",
    accreditationNumber: "",
    zatcaNumber: "",
    phone: "",
    email: "",
    contactPersonName: "",
    nationalAddressText: "",
    ibanText: "",
    priceExcludingVatSar: "",
    paymentTerms: "",
    notes: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const scrollRef = useRef<ScrollView>(null);

  const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

  useEffect(() => {
    if (!token) {
      setLinkStatus("expired");
      setLinkLoading(false);
      return;
    }
    fetch(`${API_BASE}/api/public/supplier-link/${token}`)
      .then((r) => r.json())
      .then((data: { status?: string; supplierNameHint?: string | null }) => {
        setLinkStatus((data.status as LinkStatus) ?? "expired");
        setSupplierNameHint(data.supplierNameHint ?? null);
      })
      .catch(() => setLinkStatus("expired"))
      .finally(() => setLinkLoading(false));
  }, [token, API_BASE]);

  const priceNum = parseFloat(form.priceExcludingVatSar) || 0;
  const vatAmount = priceNum > 0 ? calcVat(priceNum) : 0;
  const totalPrice = priceNum > 0 ? calcTotal(priceNum) : 0;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate(): boolean {
    const next: FormErrors = {};
    const req = t("requiredField");

    if (!form.companyName.trim()) next.companyName = req;
    if (!form.commercialRegistrationNumber.trim()) next.commercialRegistrationNumber = req;
    if (!form.accreditationNumber.trim()) next.accreditationNumber = req;
    if (!form.zatcaNumber.trim()) next.zatcaNumber = req;
    if (!form.phone.trim()) next.phone = req;
    if (!form.email.trim()) {
      next.email = req;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = t("invalidEmail");
    }
    if (!form.contactPersonName.trim()) next.contactPersonName = req;
    if (!form.nationalAddressText.trim()) next.nationalAddressText = req;
    if (!form.ibanText.trim()) next.ibanText = req;
    if (!form.priceExcludingVatSar.trim() || priceNum <= 0) {
      next.priceExcludingVatSar = t("invalidPrice");
    }
    if (!form.paymentTerms) next.paymentTerms = req;

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const handleSubmit = async () => {
    if (!validate()) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        companyName: form.companyName.trim(),
        commercialRegistrationNumber: form.commercialRegistrationNumber.trim(),
        accreditationNumber: form.accreditationNumber.trim(),
        zatcaNumber: form.zatcaNumber.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        contactPersonName: form.contactPersonName.trim(),
        nationalAddressText: form.nationalAddressText.trim(),
        ibanText: form.ibanText.trim(),
        priceExcludingVatSar: priceNum,
        paymentTerms: form.paymentTerms,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(`${API_BASE}/api/public/supplier-response/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string; code?: string };
      if (!res.ok) {
        if (data.code === "link_already_used") {
          setLinkStatus("used");
          return;
        }
        if (data.code === "link_expired" || data.code === "link_not_found") {
          setLinkStatus("expired");
          return;
        }
        setSubmitError(data.error ?? t("supplierFormError"));
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError(t("supplierFormError"));
    } finally {
      setSubmitting(false);
    }
  };

  const paddingBottom = insets.bottom + 16;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (linkLoading) {
    return (
      <View style={[sf.centered, { backgroundColor: COLORS.background }]}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={[sf.loadingText]}>{t("supplierFormLoading")}</Text>
      </View>
    );
  }

  // ── Invalid / expired link ────────────────────────────────────────────────

  if (linkStatus !== "active") {
    const msgKey: keyof typeof translations.en =
      linkStatus === "used"
        ? "supplierFormAlreadyUsed"
        : linkStatus === "deactivated" || linkStatus === "expired"
        ? "supplierFormExpired"
        : "supplierFormNotFound";
    const iconName: "x-circle" | "check-circle" =
      linkStatus === "used" ? "check-circle" : "x-circle";
    const iconColor = linkStatus === "used" ? COLORS.success : COLORS.error;

    return (
      <View style={[sf.centered, { backgroundColor: COLORS.background, paddingBottom: paddingBottom }]}>
        <Logo size="medium" />
        <View style={sf.statusCard}>
          <Icon name={iconName} size={48} color={iconColor} />
          <Text style={[sf.statusTitle, { color: iconColor }]}>
            {linkStatus === "used" ? t("supplierFormSuccess") : ""}
          </Text>
          <Text style={[sf.statusMsg, { color: COLORS.foreground }]}>{t(msgKey)}</Text>
        </View>
        <Text style={sf.poweredBy}>{t("poweredBy")}</Text>
      </View>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <View style={[sf.centered, { backgroundColor: COLORS.background, paddingBottom: paddingBottom }]}>
        <Logo size="medium" />
        <View style={[sf.statusCard, { borderColor: "#bbf7d0" }]}>
          <Icon name="check-circle" size={56} color={COLORS.success} />
          <Text style={[sf.statusTitle, { color: COLORS.success }]}>{t("supplierFormSuccess")}</Text>
          <Text style={[sf.statusMsg, { color: COLORS.mutedForeground }]}>{t("supplierFormSuccessMsg")}</Text>
        </View>
        <Text style={sf.poweredBy}>{t("poweredBy")}</Text>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[sf.scroll, { paddingBottom: paddingBottom + 20 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={[sf.header, { paddingTop: insets.top + 16 }]}>
          <Logo size="medium" />
          <Text style={sf.formTitle}>{t("supplierFormTitle")}</Text>
          {supplierNameHint ? (
            <View style={sf.hintBadge}>
              <Icon name="tag" size={13} color={COLORS.accent} />
              <Text style={sf.hintText}>{supplierNameHint}</Text>
            </View>
          ) : null}
          <Text style={sf.formSubtitle}>{t("supplierFormSubtitle")}</Text>

          {/* Language toggle */}
          <View style={sf.langToggle}>
            {(["en", "ar"] as Lang[]).map((l) => (
              <TouchableOpacity
                key={l}
                style={[sf.langBtn, lang === l && { backgroundColor: COLORS.primary }]}
                onPress={() => setLang(l)}
                activeOpacity={0.8}
              >
                <Text style={[sf.langBtnText, lang === l && { color: "#fff" }]}>
                  {l === "en" ? "English" : "العربية"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Submit error banner */}
        {submitError ? (
          <View style={sf.errorBanner}>
            <Icon name="alert-circle" size={16} color={COLORS.error} />
            <Text style={sf.errorBannerText}>{submitError}</Text>
          </View>
        ) : null}

        {/* ── Company Identity ─────────────────────────────────────────── */}
        <View style={sf.card}>
          <SectionHeader title={t("sectionCompanyIdentity")} isRTL={isRTL} />

          <Field label={t("fieldCompanyName")} required error={errors.companyName} isRTL={isRTL}>
            <StyledInput
              value={form.companyName}
              onChangeText={(v) => setField("companyName", v)}
              placeholder={t("fieldCompanyName")}
              isRTL={isRTL}
              hasError={!!errors.companyName}
            />
          </Field>

          <Field label={t("fieldCRNumber")} required error={errors.commercialRegistrationNumber} isRTL={isRTL}>
            <StyledInput
              value={form.commercialRegistrationNumber}
              onChangeText={(v) => setField("commercialRegistrationNumber", v)}
              placeholder="1010XXXXXX"
              isRTL={isRTL}
              keyboardType="default"
              hasError={!!errors.commercialRegistrationNumber}
            />
          </Field>

          <Field label={t("fieldAccreditationNumber")} required error={errors.accreditationNumber} isRTL={isRTL}>
            <StyledInput
              value={form.accreditationNumber}
              onChangeText={(v) => setField("accreditationNumber", v)}
              placeholder={t("fieldAccreditationNumber")}
              isRTL={isRTL}
              hasError={!!errors.accreditationNumber}
            />
          </Field>

          <Field label={t("fieldZatcaNumber")} required error={errors.zatcaNumber} isRTL={isRTL}>
            <StyledInput
              value={form.zatcaNumber}
              onChangeText={(v) => setField("zatcaNumber", v)}
              placeholder={t("fieldZatcaNumber")}
              isRTL={isRTL}
              keyboardType="default"
              hasError={!!errors.zatcaNumber}
            />
          </Field>
        </View>

        {/* ── Contact ─────────────────────────────────────────────────── */}
        <View style={sf.card}>
          <SectionHeader title={t("sectionContact")} isRTL={isRTL} />

          <Field label={t("fieldPhone")} required error={errors.phone} isRTL={isRTL}>
            <StyledInput
              value={form.phone}
              onChangeText={(v) => setField("phone", v)}
              placeholder="+966 5X XXX XXXX"
              isRTL={isRTL}
              keyboardType="phone-pad"
              hasError={!!errors.phone}
            />
          </Field>

          <Field label={t("fieldEmail")} required error={errors.email} isRTL={isRTL}>
            <StyledInput
              value={form.email}
              onChangeText={(v) => setField("email", v)}
              placeholder="email@company.com"
              isRTL={false}
              keyboardType="email-address"
              hasError={!!errors.email}
            />
          </Field>

          <Field label={t("fieldContactPerson")} required error={errors.contactPersonName} isRTL={isRTL}>
            <StyledInput
              value={form.contactPersonName}
              onChangeText={(v) => setField("contactPersonName", v)}
              placeholder={t("fieldContactPerson")}
              isRTL={isRTL}
              hasError={!!errors.contactPersonName}
            />
          </Field>
        </View>

        {/* ── National Address ────────────────────────────────────────── */}
        <View style={sf.card}>
          <SectionHeader title={t("sectionAddress")} isRTL={isRTL} />

          <Field label={t("fieldNationalAddress")} required error={errors.nationalAddressText} isRTL={isRTL}>
            <StyledInput
              value={form.nationalAddressText}
              onChangeText={(v) => setField("nationalAddressText", v)}
              placeholder={t("fieldNationalAddress")}
              isRTL={isRTL}
              multiline
              hasError={!!errors.nationalAddressText}
            />
          </Field>
        </View>

        {/* ── Banking ─────────────────────────────────────────────────── */}
        <View style={sf.card}>
          <SectionHeader title={t("sectionBanking")} isRTL={isRTL} />

          <Field label={t("fieldIban")} required error={errors.ibanText} isRTL={isRTL}>
            <StyledInput
              value={form.ibanText}
              onChangeText={(v) => setField("ibanText", v)}
              placeholder="SA00 0000 0000 0000 0000 0000"
              isRTL={false}
              hasError={!!errors.ibanText}
            />
          </Field>
        </View>

        {/* ── Pricing ─────────────────────────────────────────────────── */}
        <View style={sf.card}>
          <SectionHeader title={t("sectionPricing")} isRTL={isRTL} />

          <Field label={t("fieldPriceExclVat")} required error={errors.priceExcludingVatSar} isRTL={isRTL}>
            <StyledInput
              value={form.priceExcludingVatSar}
              onChangeText={(v) => setField("priceExcludingVatSar", v.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              isRTL={false}
              keyboardType="numeric"
              hasError={!!errors.priceExcludingVatSar}
            />
          </Field>

          {priceNum > 0 && (
            <View style={[sf.vatBox, isRTL && { direction: "rtl" }]}>
              <Text style={sf.vatNote}>{t("vatNote")}</Text>
              <View style={[sf.vatRow, isRTL && { flexDirection: "row-reverse" }]}>
                <Text style={sf.vatLabel}>{t("vatLabel")}:</Text>
                <Text style={sf.vatValue}>SAR {formatSar(vatAmount)}</Text>
              </View>
              <View style={[sf.vatRow, isRTL && { flexDirection: "row-reverse" }]}>
                <Text style={[sf.vatLabel, { fontFamily: "Inter_700Bold" }]}>{t("priceInclVatLabel")}:</Text>
                <Text style={[sf.vatValue, { color: COLORS.primary, fontFamily: "Inter_700Bold" }]}>
                  SAR {formatSar(totalPrice)}
                </Text>
              </View>
            </View>
          )}

          <Field label={t("fieldPaymentTerms")} required error={errors.paymentTerms} isRTL={isRTL}>
            <PaymentTermSelector
              value={form.paymentTerms}
              onChange={(v) => setField("paymentTerms", v)}
              options={PAYMENT_OPTIONS}
              isRTL={isRTL}
              hasError={!!errors.paymentTerms}
            />
          </Field>
        </View>

        {/* ── Notes ───────────────────────────────────────────────────── */}
        <View style={sf.card}>
          <SectionHeader title={t("sectionNotes")} isRTL={isRTL} />
          <Field label={t("fieldNotes")} isRTL={isRTL}>
            <StyledInput
              value={form.notes}
              onChangeText={(v) => setField("notes", v)}
              placeholder={t("fieldNotes")}
              isRTL={isRTL}
              multiline
            />
          </Field>
        </View>

        {/* ── Submit ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[sf.submitBtn, submitting && { opacity: 0.65 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="send" size={18} color="#fff" />
              <Text style={sf.submitBtnText}>{t("supplierFormSubmit")}</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={sf.poweredBy}>{t("poweredBy")}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sf = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.mutedForeground,
    marginTop: 8,
  },
  scroll: {
    padding: 16,
    gap: 12,
  },
  header: {
    alignItems: "center",
    gap: 8,
    paddingBottom: 4,
  },
  formTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: COLORS.primary,
    textAlign: "center",
    marginTop: 8,
  },
  formSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  hintBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.accent + "1A",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  hintText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.accent,
  },
  langToggle: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    backgroundColor: COLORS.card,
  },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  langBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.mutedForeground,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.error,
    lineHeight: 18,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  fieldWrap: {
    gap: 5,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.foreground,
  },
  required: {
    fontSize: 13,
    color: COLORS.error,
    fontFamily: "Inter_700Bold",
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.foreground,
    backgroundColor: COLORS.card,
  },
  errorText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: COLORS.error,
  },
  vatBox: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 12,
    gap: 6,
  },
  vatNote: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#1E40AF",
    marginBottom: 2,
  },
  vatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  vatLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#1E40AF",
  },
  vatValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#1E40AF",
  },
  paymentGrid: {
    gap: 8,
  },
  paymentOption: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: COLORS.card,
  },
  paymentOptionText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.foreground,
    textAlign: "left",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  poweredBy: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.mutedForeground,
    textAlign: "center",
    marginTop: 12,
  },
  statusCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 28,
    alignItems: "center",
    gap: 12,
    width: "100%",
    maxWidth: 400,
  },
  statusTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  statusMsg: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
});
