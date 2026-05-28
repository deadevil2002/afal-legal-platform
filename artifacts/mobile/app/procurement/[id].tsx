import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useDialog } from "@/context/DialogContext";
import { apiGet, apiPost, cfApiGet, cfApiPost } from "@/lib/apiClient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { ProcurementStageBadge } from "@/components/ProcurementStageBadge";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import {
  ProcurementRequest,
  QuotationAttachment,
  useProcurementRequests,
} from "@/context/ProcurementRequestsContext";
import { db } from "@/lib/firebase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

// ─── Quotation file helpers ───────────────────────────────────────────────────
// Lightweight open/download used by quotation card buttons.
// Avoids embedding the full AttachmentViewer (which renders two wide text
// buttons that don't fit inside compact cards).

async function openQuotationFile(url: string): Promise<void> {
  if (!url) return;
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    // ignore — user can try again
  }
}

function downloadQuotationFile(url: string): void {
  if (!url) return;
  const dlUrl = url.includes("?")
    ? `${url}&fl_attachment=true`
    : `${url}?fl_attachment=true`;
  openQuotationFile(dlUrl).catch(() => openQuotationFile(url).catch(() => {}));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredAttachment {
  name: string;
  url: string;
  type: string;
  size?: number;
  uploadedAt?: string;
}

interface AttachmentRef {
  url: string;
  name: string;
  storagePath?: string;
}

interface WorkflowEvent {
  id: string;
  requestId: string;
  actorUid: string | null;
  actorName: string | null;
  actorRole: string | null;
  eventType: string;
  fromStage: string | null;
  toStage: string | null;
  comment: string | null;
  createdAt: unknown;
  metadata: Record<string, unknown> | null;
}

interface SupplierResponse {
  id: string;
  linkId: string;
  requestId: string;
  companyName?: string;
  commercialRegistrationNumber?: string;
  commercialRegistrationAttachment?: AttachmentRef;
  accreditationNumber?: string;
  accreditationAttachment?: AttachmentRef;
  zatcaNumber?: string;
  contactPersonName?: string;
  phone?: string;
  email?: string;
  nationalAddressText?: string;
  nationalAddressAttachment?: AttachmentRef;
  ibanText?: string;
  ibanAttachment?: AttachmentRef;
  currency?: "SAR" | "USD";
  priceExcludingVatSar?: number;
  vatAmountSar?: number;
  priceIncludingVatSar?: number;
  paymentTerms?: "advance" | "50_50" | "after_supply";
  notes?: string | null;
  quotationAttachment?: AttachmentRef | null;
  extraAttachments?: AttachmentRef[];
  reviewStatus?: string;
  submittedAt?: { seconds: number; nanoseconds: number } | null;
}

interface SupplierLink {
  id: string;
  requestId: string;
  token: string;
  supplierNameHint: string | null;
  createdByUid: string;
  isActive: boolean;
  expiresAt: { seconds: number; nanoseconds: number } | null;
  submittedAt: { seconds: number; nanoseconds: number } | null;
  responseId: string | null;
  response: SupplierResponse | null;
  createdAt: { seconds: number; nanoseconds: number } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTs(ts: unknown, isRTL: boolean): string {
  try {
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString(isRTL ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDateShort(iso: string, isRTL: boolean): string {
  try {
    return new Date(iso).toLocaleDateString(isRTL ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function fileColorForType(mimeType: string | null | undefined): string {
  if (!mimeType) return "#6B7280";
  if (mimeType.includes("pdf")) return "#DC2626";
  if (mimeType.includes("sheet") || mimeType.includes("xlsx") || mimeType.includes("csv")) return "#16A34A";
  if (mimeType.includes("word") || mimeType.includes("document")) return "#2563EB";
  if (mimeType.startsWith("image/")) return "#0891B2";
  return "#6B7280";
}

function fileIconForType(mimeType: string | null | undefined): "file-doc" | "image" | "paperclip" {
  if (!mimeType) return "paperclip";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("document") || mimeType.includes("sheet")) return "file-doc";
  return "paperclip";
}

type BudgetStageStatus = "completed" | "current" | "pending";

function getBudgetStageStatus(status: string, stageKey: string): BudgetStageStatus {
  const completed: Record<string, string[]> = {
    planning: ["planning_approved", "finance_review", "finance_approved", "evp_review", "evp_approved", "ceo_review", "approved", "closed"],
    finance: ["finance_approved", "evp_review", "evp_approved", "ceo_review", "approved", "closed"],
    evp: ["evp_approved", "ceo_review", "approved", "closed"],
    ceo: ["approved", "ceo_approved", "closed"],
  };
  const current: Record<string, string[]> = {
    planning: ["planning_review"],
    finance: ["finance_review"],
    evp: ["evp_review"],
    ceo: ["ceo_review"],
  };
  if (completed[stageKey]?.includes(status)) return "completed";
  if (current[stageKey]?.includes(status)) return "current";
  return "pending";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RFQIconBadge() {
  return (
    <View style={sub.rfqBadge}>
      <Text style={sub.rfqBadgeText}>RFQ</Text>
      <View style={sub.rfqLines}>
        <View style={sub.rfqLine} />
        <View style={sub.rfqLine} />
        <View style={[sub.rfqLine, { width: "60%" }]} />
      </View>
    </View>
  );
}

function SectionCard({
  icon,
  label,
  badge,
  children,
  colors,
}: {
  icon?: string;
  label: string;
  badge?: string;
  children: React.ReactNode;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={[sub.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={sub.sectionHeader}>
        {icon ? (
          <View style={[sub.sectionIconWrap, { backgroundColor: colors.primary + "18" }]}>
            <Icon name={icon as never} size={15} color={colors.primary} />
          </View>
        ) : null}
        <Text style={[sub.sectionLabel, { color: colors.foreground }]}>{label}</Text>
        {badge ? (
          <View style={[sub.sectionBadge, { backgroundColor: colors.primary + "15" }]}>
            <Text style={[sub.sectionBadgeText, { color: colors.primary }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={[sub.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[sub.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[sub.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function QuotationCard({
  quotation,
  index,
  colors,
  t,
  isRTL,
}: {
  quotation: QuotationAttachment;
  index: number;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const fileColor = fileColorForType(quotation.type);
  const fileIcon = fileIconForType(quotation.type);
  const shortLabel = quotation.customLabel ?? `${t("quotationLabel" as never)} ${index + 1}`;
  const showFilename = quotation.name && quotation.name !== shortLabel;
  const meta = [
    quotation.size ? formatFileSize(quotation.size) : null,
    quotation.uploadedAt ? formatDateShort(quotation.uploadedAt, isRTL) : null,
  ].filter(Boolean).join(" · ");

  return (
    <View style={[sub.quotationCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[sub.qcIconWrap, { backgroundColor: fileColor + "18" }]}>
        <Icon name={fileIcon} size={20} color={fileColor} />
      </View>
      <View style={sub.qcContent}>
        <Text style={[sub.qcLabel, { color: colors.foreground }]} numberOfLines={1}>
          {shortLabel}
        </Text>
        {showFilename ? (
          <Text style={[sub.qcFilename, { color: colors.mutedForeground }]} numberOfLines={1}>
            {quotation.name}
          </Text>
        ) : null}
        {meta ? (
          <Text style={[sub.qcMeta, { color: colors.mutedForeground }]}>{meta}</Text>
        ) : null}
      </View>
      <View style={sub.qcActions}>
        <TouchableOpacity
          style={sub.qcActionBtn}
          onPress={() => { openQuotationFile(quotation.url).catch(() => {}); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="external-link" size={17} color={colors.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={sub.qcActionBtn}
          onPress={() => downloadQuotationFile(quotation.url)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="download" size={17} color={colors.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SelectableQuotationCard({
  quotation,
  index,
  selected,
  onSelect,
  canSelect,
  colors,
  t,
  isRTL,
}: {
  quotation: QuotationAttachment;
  index: number;
  selected: boolean;
  onSelect: () => void;
  canSelect: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const fileColor = fileColorForType(quotation.type);
  const fileIcon = fileIconForType(quotation.type);
  const shortLabel = quotation.customLabel ?? `${t("quotationLabel" as never)} ${index + 1}`;
  const showFilename = quotation.name && quotation.name !== shortLabel;
  const accent = selected ? colors.primary : fileColor;

  const cardContent = (
    <>
      {canSelect ? (
        <View style={[sub.qcCircle, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          {selected ? <Icon name="check" size={11} color="#fff" /> : null}
        </View>
      ) : null}
      <View style={[sub.qcIconWrap, { backgroundColor: accent + "18" }]}>
        <Icon name={fileIcon} size={20} color={accent} />
      </View>
      <View style={sub.qcContent}>
        <Text style={[sub.qcLabel, { color: selected ? colors.primary : colors.foreground }]} numberOfLines={1}>
          {shortLabel}
        </Text>
        {showFilename ? (
          <Text style={[sub.qcFilename, { color: colors.mutedForeground }]} numberOfLines={1}>
            {quotation.name}
          </Text>
        ) : null}
        {quotation.size ? (
          <Text style={[sub.qcMeta, { color: colors.mutedForeground }]}>
            {formatFileSize(quotation.size)}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={sub.qcActionBtn}
        onPress={() => { openQuotationFile(quotation.url).catch(() => {}); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="external-link" size={17} color={selected ? colors.primary : colors.secondary} />
      </TouchableOpacity>
    </>
  );

  if (!canSelect) {
    return (
      <View
        style={[
          sub.quotationCard,
          {
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.primary + "0A" : colors.background,
            borderWidth: selected ? 2 : 1,
          },
        ]}
      >
        {cardContent}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[
        sub.quotationCard,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primary + "0A" : colors.background,
          borderWidth: selected ? 2 : 1,
        },
      ]}
      onPress={onSelect}
      activeOpacity={0.75}
    >
      {cardContent}
    </TouchableOpacity>
  );
}

function SelectableSupplierResponseCard({
  response,
  index,
  selected,
  onSelect,
  canSelect,
  onViewDetails,
  colors,
  t,
  isRTL,
}: {
  response: SupplierResponse;
  index: number;
  selected: boolean;
  onSelect: () => void;
  canSelect: boolean;
  onViewDetails: (r: SupplierResponse) => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const accent = selected ? colors.primary : "#16A34A";
  const paymentLabel =
    response.paymentTerms === "advance"   ? t("paymentAdvance" as never)
    : response.paymentTerms === "50_50"   ? t("payment50_50" as never)
    : response.paymentTerms === "after_supply" ? t("paymentAfterSupply" as never)
    : response.paymentTerms ?? "—";

  const cardInner = (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={[{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }]}>
        {canSelect ? (
          <View style={[sub.qcCircle, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            {selected ? <Icon name="check" size={11} color="#fff" /> : null}
          </View>
        ) : null}
        <View style={[sub.qcIconWrap, { backgroundColor: accent + "18", flexShrink: 0 }]}>
          <Icon name="briefcase" size={20} color={accent} />
        </View>
        <View style={sub.qcContent}>
          <Text style={[sub.qcLabel, { color: selected ? colors.primary : colors.foreground }]} numberOfLines={1}>
            {response.companyName ?? `${t("quotationLabel" as never)} ${index + 1}`}
          </Text>
          {response.contactPersonName ? (
            <Text style={[sub.qcFilename, { color: colors.mutedForeground }]} numberOfLines={1}>
              {response.contactPersonName}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={sub.qcActionBtn}
          onPress={() => onViewDetails(response)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="external-link" size={17} color={selected ? colors.primary : colors.secondary} />
        </TouchableOpacity>
      </View>

      <View style={[sqr.pricingGrid, { borderColor: colors.border }]}>
        {response.priceExcludingVatSar != null ? (
          <View style={sqr.priceCell}>
            <Text style={[sqr.priceLabel, { color: colors.mutedForeground }]}>{t("priceExclVatLabel" as never)}</Text>
            <Text style={[sqr.priceValue, { color: colors.foreground }]}>
              {response.currency ?? "SAR"} {response.priceExcludingVatSar.toLocaleString()}
            </Text>
          </View>
        ) : null}
        {response.vatAmountSar != null ? (
          <View style={sqr.priceCell}>
            <Text style={[sqr.priceLabel, { color: colors.mutedForeground }]}>{t("vatLabel" as never)}</Text>
            <Text style={[sqr.priceValue, { color: colors.foreground }]}>
              SAR {response.vatAmountSar.toLocaleString()}
            </Text>
          </View>
        ) : null}
        {response.priceIncludingVatSar != null ? (
          <View style={sqr.priceCell}>
            <Text style={[sqr.priceLabel, { color: colors.mutedForeground }]}>{t("priceInclVatLabel" as never)}</Text>
            <Text style={[sqr.priceValue, { color: selected ? colors.primary : "#16A34A", fontFamily: "Inter_700Bold" }]}>
              SAR {response.priceIncludingVatSar.toLocaleString()}
            </Text>
          </View>
        ) : null}
        {response.paymentTerms ? (
          <View style={sqr.priceCell}>
            <Text style={[sqr.priceLabel, { color: colors.mutedForeground }]}>{t("paymentTermsLabel" as never)}</Text>
            <Text style={[sqr.priceValue, { color: colors.foreground }]}>{paymentLabel}</Text>
          </View>
        ) : null}
      </View>

      {response.quotationAttachment?.url ? (
        <TouchableOpacity
          style={[sqr.attachBtn, { backgroundColor: colors.secondary + "15", borderColor: colors.secondary + "40" }]}
          onPress={() => { openQuotationFile(response.quotationAttachment!.url).catch(() => {}); }}
        >
          <Icon name="file-doc" size={13} color={colors.secondary} />
          <Text style={[sqr.attachBtnText, { color: colors.secondary }]} numberOfLines={1}>
            {response.quotationAttachment.name}
          </Text>
          <Icon name="external-link" size={12} color={colors.secondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (!canSelect) {
    return (
      <View style={[sub.quotationCard, { alignItems: "flex-start", borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + "0A" : colors.background, borderWidth: selected ? 2 : 1 }]}>
        {cardInner}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[sub.quotationCard, { alignItems: "flex-start", borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + "0A" : colors.background, borderWidth: selected ? 2 : 1 }]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      {cardInner}
    </TouchableOpacity>
  );
}

function ApprovedCard({
  quotation,
  colors,
  t,
  isRTL,
}: {
  quotation: { url?: string | null; name?: string | null; type?: string | null; customLabel?: string | null };
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const fileColor = fileColorForType(quotation.type);
  const fileIcon = fileIconForType(quotation.type);
  const shortLabel = quotation.customLabel ?? t("approvedQuotationLabel" as never);
  const showFilename = quotation.name && quotation.name !== shortLabel;

  return (
    <View style={[sub.approvedCard, { borderColor: "#16A34A30", backgroundColor: "#F0FDF4" }]}>
      <View style={[sub.approvedIconWrap, { backgroundColor: "#16A34A" }]}>
        <Icon name="check" size={16} color="#fff" />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={sub.approvedRow}>
          <Icon name={fileIcon} size={15} color={fileColor} />
          <Text style={[sub.approvedName, { color: "#166534" }]} numberOfLines={1}>
            {shortLabel}
          </Text>
        </View>
        {showFilename ? (
          <Text style={[sub.approvedFilename, { color: "#16A34A" }]} numberOfLines={1}>
            {quotation.name}
          </Text>
        ) : null}
        <Text style={[sub.approvedMeta, { color: "#166534", opacity: 0.7 }]}>
          {t("approvedAttachmentDesc" as never)}
        </Text>
      </View>
      {quotation.url ? (
        <View style={sub.qcActions}>
          <TouchableOpacity
            style={sub.qcActionBtn}
            onPress={() => { openQuotationFile(quotation.url!).catch(() => {}); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="external-link" size={17} color="#16A34A" />
          </TouchableOpacity>
          <TouchableOpacity
            style={sub.qcActionBtn}
            onPress={() => downloadQuotationFile(quotation.url!)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="download" size={17} color="#16A34A" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function BudgetWorkflow({
  status,
  colors,
  t,
  isRTL,
}: {
  status: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const stages = [
    { key: "planning", labelKey: "stagePlanning", icon: "file-doc" },
    { key: "finance", labelKey: "stageFinance", icon: "wallet" },
    { key: "evp", labelKey: "stageEVP", icon: "trending-up" },
    { key: "ceo", labelKey: "stageCEO", icon: "user" },
  ] as const;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
      <View style={[sub.wfRow, isRTL && { flexDirection: "row-reverse" }]}>
        {stages.map((stage, i) => {
          const st = getBudgetStageStatus(status, stage.key);
          const isLast = i === stages.length - 1;
          const dotColor =
            st === "completed" ? "#16A34A" : st === "current" ? colors.primary : colors.border;
          return (
            <View
              key={stage.key}
              style={[sub.wfItem, isRTL && { flexDirection: "row-reverse" }]}
            >
              <View style={sub.wfStage}>
                <View
                  style={[
                    sub.wfCircle,
                    { borderColor: dotColor, backgroundColor: st === "completed" ? "#16A34A" : st === "current" ? colors.primary + "15" : "#F9FAFB" },
                  ]}
                >
                  {st === "completed" ? (
                    <Icon name="check" size={13} color="#fff" />
                  ) : (
                    <Icon name={stage.icon as never} size={13} color={dotColor} />
                  )}
                </View>
                <Text
                  style={[
                    sub.wfLabel,
                    {
                      color:
                        st === "completed" ? "#16A34A" : st === "current" ? colors.primary : colors.mutedForeground,
                      fontFamily: st === "current" ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {t(stage.labelKey as never)}
                </Text>
              </View>
              {!isLast && (
                <View style={sub.wfArrow}>
                  <Icon
                    name={isRTL ? "chevron-left" : "chevron-right"}
                    size={14}
                    color={getBudgetStageStatus(status, stages[i + 1].key) !== "pending" ? "#16A34A" : colors.border}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function SapSteps({
  prNumber,
  poNumber,
  colors,
  t,
  isRTL,
}: {
  prNumber: string | null;
  poNumber: string | null;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const steps = [
    { labelKey: "sapPrCreated", icon: "shopping-cart", done: !!prNumber },
    { labelKey: "sapPrReviewed", icon: "file-doc", done: !!poNumber },
    { labelKey: "sapPrApproved", icon: "check-circle", done: !!poNumber },
    { labelKey: "sapSentToSap", icon: "send", done: false },
  ] as const;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
      <View style={[sub.wfRow, isRTL && { flexDirection: "row-reverse" }]}>
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const dotColor = step.done ? "#16A34A" : colors.border;
          return (
            <View key={step.labelKey} style={[sub.wfItem, isRTL && { flexDirection: "row-reverse" }]}>
              <View style={sub.wfStage}>
                <View
                  style={[
                    sub.wfCircle,
                    {
                      borderColor: dotColor,
                      backgroundColor: step.done ? "#16A34A" : "#F9FAFB",
                    },
                  ]}
                >
                  <Icon name={step.icon as never} size={13} color={step.done ? "#fff" : colors.mutedForeground} />
                </View>
                <Text style={[sub.wfLabel, { color: step.done ? "#16A34A" : colors.mutedForeground }]}>
                  {t(step.labelKey as never)}
                </Text>
              </View>
              {!isLast && (
                <View style={sub.wfArrow}>
                  <Icon
                    name={isRTL ? "chevron-left" : "chevron-right"}
                    size={14}
                    color={steps[i + 1]?.done ? "#16A34A" : colors.border}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  quotation_uploaded:                    "Quotation uploaded",
  quotations_forwarded:                  "Quotations forwarded to requester",
  quotation_selected:                    "Requester approved quotation",
  requester_selected_supplier_quotation: "Requester selected supplier quotation",
  requester_rejected_supplier_quotation: "Requester rejected all quotations",
  planning_approved:                     "Planning approved",
  planning_rejected:                     "Planning rejected",
  finance_approved:                      "Finance approved",
  finance_rejected:                      "Finance rejected",
  evp_approved:                          "EVP approved",
  evp_rejected:                          "EVP rejected",
  ceo_approved:                          "CEO approved",
  ceo_rejected:                          "CEO rejected",
};

function TimelineEvent({ event, isLast, colors, isRTL }: {
  event: WorkflowEvent;
  isLast: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  isRTL: boolean;
}) {
  return (
    <View style={tl.row}>
      <View style={tl.left}>
        <View style={[tl.dot, { backgroundColor: colors.primary }]} />
        {!isLast && <View style={[tl.line, { backgroundColor: colors.border }]} />}
      </View>
      <View style={[tl.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[tl.eventType, { color: colors.primary }]}>
          {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType.replace(/_/g, " ")}
        </Text>
        {event.actorName ? (
          <Text style={[tl.actor, { color: colors.mutedForeground }]}>
            {event.actorName}{event.actorRole ? ` · ${event.actorRole}` : ""}
          </Text>
        ) : null}
        {event.comment ? (
          <Text style={[tl.comment, { color: colors.foreground }]}>{event.comment}</Text>
        ) : null}
        {event.toStage ? (
          <View style={{ marginTop: 4 }}>
            <ProcurementStageBadge stage={event.toStage} />
          </View>
        ) : null}
        <Text style={[tl.date, { color: colors.mutedForeground }]}>
          {formatTs(event.createdAt, isRTL)}
        </Text>
      </View>
    </View>
  );
}

// ─── Supplier Response Detail Modal ──────────────────────────────────────────

function AttachmentRow({
  label,
  attachment,
  colors,
}: {
  label: string;
  attachment: AttachmentRef;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  if (!attachment?.url) return null;
  const ext = (attachment.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fakeMime = ext === "pdf" ? "application/pdf"
    : ext === "doc" || ext === "docx" ? "application/msword"
    : ext === "jpg" || ext === "jpeg" || ext === "png" ? `image/${ext}`
    : "application/octet-stream";
  const fileColor = fileColorForType(fakeMime);
  const fileIcon = fileIconForType(fakeMime);
  return (
    <View style={[rd.attachRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[rd.attachIconWrap, { backgroundColor: fileColor + "18" }]}>
        <Icon name={fileIcon} size={16} color={fileColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[rd.attachLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[rd.attachName, { color: colors.foreground }]} numberOfLines={1}>
          {attachment.name}
        </Text>
      </View>
      <View style={rd.attachActions}>
        <TouchableOpacity
          style={rd.attachActionBtn}
          onPress={() => { openQuotationFile(attachment.url).catch(() => {}); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="external-link" size={15} color={colors.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={rd.attachActionBtn}
          onPress={() => downloadQuotationFile(attachment.url)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="download" size={15} color={colors.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SupplierResponseDetailModal({
  response,
  onClose,
  colors,
  t,
  isRTL,
}: {
  response: SupplierResponse | null;
  onClose: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  if (!response) return null;

  const paymentLabel =
    response.paymentTerms === "advance" ? t("paymentAdvance" as never)
    : response.paymentTerms === "50_50" ? t("payment50_50" as never)
    : response.paymentTerms === "after_supply" ? t("paymentAfterSupply" as never)
    : response.paymentTerms ?? "—";

  const namedAttachments = [
    { label: t("crAttachment" as never),                att: response.commercialRegistrationAttachment },
    { label: t("accreditationAttachment" as never),     att: response.accreditationAttachment },
    { label: t("nationalAddressAttachment" as never),   att: response.nationalAddressAttachment },
    { label: t("ibanAttachment" as never),              att: response.ibanAttachment },
    { label: t("quotationAttachmentLabel" as never),    att: response.quotationAttachment },
  ].filter((a): a is { label: string; att: AttachmentRef } => !!(a.att?.url));

  const extras = (response.extraAttachments ?? []).filter((e) => e?.url);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={rd.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={rd.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[rd.sheet, { backgroundColor: colors.card }]}>
          <View style={[rd.header, { borderBottomColor: colors.border }]}>
            <View style={[rd.headerIconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Icon name="file-doc" size={18} color={colors.primary} />
            </View>
            <Text style={[rd.headerTitle, { color: colors.foreground }]}>
              {t("responseDetailTitle" as never)}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView style={rd.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Company Identity */}
            <Text style={[rd.groupTitle, { color: colors.primary }]}>
              {t("companyNameLabel" as never)}
            </Text>
            <View style={[rd.group, { borderColor: colors.border }]}>
              <InfoRow label={t("companyNameLabel" as never)} value={response.companyName ?? "—"} colors={colors} />
              {response.commercialRegistrationNumber ? (
                <InfoRow label={t("crNumberLabel" as never)} value={response.commercialRegistrationNumber} colors={colors} />
              ) : null}
              {response.accreditationNumber ? (
                <InfoRow label={t("accreditationNumberLabel" as never)} value={response.accreditationNumber} colors={colors} />
              ) : null}
              {response.zatcaNumber ? (
                <InfoRow label={t("zatcaNumberLabel" as never)} value={response.zatcaNumber} colors={colors} />
              ) : null}
            </View>

            {/* Contact */}
            <Text style={[rd.groupTitle, { color: colors.primary }]}>
              {t("contactPersonLabel" as never)}
            </Text>
            <View style={[rd.group, { borderColor: colors.border }]}>
              {response.contactPersonName ? (
                <InfoRow label={t("contactPersonLabel" as never)} value={response.contactPersonName} colors={colors} />
              ) : null}
              {response.phone ? (
                <InfoRow label={t("phoneLabel" as never)} value={response.phone} colors={colors} />
              ) : null}
              {response.email ? (
                <InfoRow label={t("emailLabel" as never)} value={response.email} colors={colors} />
              ) : null}
            </View>

            {/* Address & Banking */}
            <Text style={[rd.groupTitle, { color: colors.primary }]}>
              {t("nationalAddressLabel" as never)}
            </Text>
            <View style={[rd.group, { borderColor: colors.border }]}>
              {response.nationalAddressText ? (
                <InfoRow label={t("nationalAddressLabel" as never)} value={response.nationalAddressText} colors={colors} />
              ) : null}
              {response.ibanText ? (
                <InfoRow label={t("ibanLabel" as never)} value={response.ibanText} colors={colors} />
              ) : null}
            </View>

            {/* Pricing */}
            <Text style={[rd.groupTitle, { color: colors.primary }]}>
              {t("priceExclVatLabel" as never)}
            </Text>
            <View style={[rd.group, { borderColor: colors.border }]}>
              {response.currency ? (
                <InfoRow label={t("currencyLabel" as never)} value={response.currency} colors={colors} />
              ) : null}
              {response.priceExcludingVatSar != null ? (
                <InfoRow
                  label={t("priceExclVatLabel" as never)}
                  value={`${response.currency ?? "SAR"} ${response.priceExcludingVatSar.toLocaleString()}`}
                  colors={colors}
                />
              ) : null}
              {response.vatAmountSar != null ? (
                <InfoRow label={t("vatLabel" as never)} value={`SAR ${response.vatAmountSar.toLocaleString()}`} colors={colors} />
              ) : null}
              {response.priceIncludingVatSar != null ? (
                <InfoRow
                  label={t("priceInclVatLabel" as never)}
                  value={`SAR ${response.priceIncludingVatSar.toLocaleString()}`}
                  colors={colors}
                />
              ) : null}
              <InfoRow label={t("paymentTermsLabel" as never)} value={paymentLabel} colors={colors} />
              {response.notes ? (
                <InfoRow label="Notes" value={response.notes} colors={colors} />
              ) : null}
            </View>

            {/* Attachments */}
            {(namedAttachments.length > 0 || extras.length > 0) ? (
              <>
                <Text style={[rd.groupTitle, { color: colors.primary }]}>
                  {t("attachmentsSection" as never)}
                </Text>
                <View style={{ gap: 8 }}>
                  {namedAttachments.map((a, i) => (
                    <AttachmentRow key={i} label={a.label} attachment={a.att} colors={colors} />
                  ))}
                  {extras.map((ex, i) => (
                    <AttachmentRow
                      key={`extra-${i}`}
                      label={`${t("extraAttachmentsLabel" as never)} ${i + 1}`}
                      attachment={ex}
                      colors={colors}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Supplier Link sub-components ────────────────────────────────────────────

function SupplierLinkCard({
  link,
  onShare,
  onDeactivate,
  canDeactivate,
  onViewResponse,
  isSelected,
  onToggleSelect,
  colors,
  t,
  isRTL,
}: {
  link: SupplierLink;
  onShare: (url: string, hint: string | null) => void;
  onDeactivate: (id: string) => void;
  canDeactivate: boolean;
  onViewResponse: (response: SupplierResponse) => void;
  isSelected: boolean;
  onToggleSelect: (responseId: string) => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const nowSeconds = Date.now() / 1000;
  const isExpired  = link.expiresAt ? link.expiresAt.seconds < nowSeconds : false;
  const isResponded = !!link.response;
  const isLinkActive = link.isActive && !isExpired && !isResponded;
  const statusColor =
    isResponded        ? "#16A34A"
    : !link.isActive || isExpired ? "#DC2626"
    : colors.secondary;
  const statusKey: never = (
    isResponded          ? "linkStatusResponded"
    : !link.isActive || isExpired ? "linkStatusExpired"
    : "linkStatusActive"
  ) as never;

  const baseUrl  = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
  const publicUrl = `${baseUrl}/supplier/${link.token}`;
  const resp = link.response;

  return (
    <View style={[sl.linkCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[sl.linkHeader, isRTL && { flexDirection: "row-reverse" }]}>
        <View style={[sl.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[sl.linkHint, { color: colors.foreground }]} numberOfLines={1}>
          {link.supplierNameHint ?? "—"}
        </Text>
        <View style={[sl.statusChip, { backgroundColor: statusColor + "18" }]}>
          <Text style={[sl.statusChipText, { color: statusColor }]}>{t(statusKey)}</Text>
        </View>
      </View>

      {resp && (
        <View style={[sl.responseBox, { backgroundColor: "#F0FDF4", borderColor: "#16A34A30" }]}>
          <View style={[sl.responseRow, isRTL && { flexDirection: "row-reverse" }]}>
            <Icon name="check-circle" size={14} color="#16A34A" />
            <Text style={[sl.responseLabel, { color: "#166534" }]}>{t("supplierResponseSection" as never)}</Text>
          </View>
          <View style={sl.responseDetails}>
            {resp.companyName ? (
              <Text style={[sl.responseDetail, { color: "#166534" }]}>
                {t("companyNameLabel" as never)}: {resp.companyName}
              </Text>
            ) : null}
            {resp.contactPersonName ? (
              <Text style={[sl.responseDetail, { color: "#166534" }]}>
                {t("contactPersonLabel" as never)}: {resp.contactPersonName}
              </Text>
            ) : null}
            {resp.priceExcludingVatSar != null ? (
              <Text style={[sl.responseDetail, { color: "#166534" }]}>
                {t("priceExclVatLabel" as never)}: {resp.currency ?? "SAR"} {resp.priceExcludingVatSar.toLocaleString()}
              </Text>
            ) : null}
            {resp.priceIncludingVatSar != null ? (
              <Text style={[sl.responseDetail, { color: "#166534", fontFamily: "Inter_600SemiBold" }]}>
                {t("priceInclVatLabel" as never)}: SAR {resp.priceIncludingVatSar.toLocaleString()}
              </Text>
            ) : null}
            {resp.paymentTerms ? (
              <Text style={[sl.responseDetail, { color: "#166534" }]}>
                {t("paymentTermsLabel" as never)}:{" "}
                {resp.paymentTerms === "advance"
                  ? t("paymentAdvance" as never)
                  : resp.paymentTerms === "50_50"
                  ? t("payment50_50" as never)
                  : t("paymentAfterSupply" as never)}
              </Text>
            ) : null}
          </View>
          {resp.reviewStatus === "forwarded" ? (
            <View style={[sl.forwardedBadge, isRTL && { flexDirection: "row-reverse" }]}>
              <Icon name="check-circle" size={13} color="#16A34A" />
              <Text style={[sl.forwardedBadgeText, { color: "#16A34A" }]}>
                {t("forwardedToRequesterBadge" as never)}
              </Text>
              <TouchableOpacity
                style={[sl.viewDetailsBtn, { backgroundColor: "#16663415", marginLeft: "auto" as unknown as number }]}
                onPress={() => onViewResponse(resp)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Icon name="external-link" size={13} color="#166634" />
                <Text style={[sl.viewDetailsBtnText, { color: "#166634" }]}>
                  {t("viewResponseDetails" as never)}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[sl.responseSelectRow, isRTL && { flexDirection: "row-reverse" }]}>
              <TouchableOpacity
                style={[sl.selectCheckbox, isSelected && { backgroundColor: "#16A34A", borderColor: "#16A34A" }]}
                onPress={() => onToggleSelect(resp.id)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                {isSelected ? <Icon name="check" size={10} color="#fff" /> : null}
              </TouchableOpacity>
              <Text style={[sl.selectLabel, { color: "#166534" }]}>
                {isSelected ? t("deselectResponse" as never) : t("selectResponse" as never)}
              </Text>
              <TouchableOpacity
                style={[sl.viewDetailsBtn, { backgroundColor: "#16663415" }]}
                onPress={() => onViewResponse(resp)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Icon name="external-link" size={13} color="#166634" />
                <Text style={[sl.viewDetailsBtnText, { color: "#166634" }]}>
                  {t("viewResponseDetails" as never)}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={[sl.linkActions, isRTL && { flexDirection: "row-reverse" }]}>
        {isLinkActive && (
          <TouchableOpacity
            style={[sl.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => onShare(publicUrl, link.supplierNameHint)}
            activeOpacity={0.8}
          >
            <Icon name="send" size={13} color="#fff" />
            <Text style={sl.actionBtnText}>{t("shareLink" as never)}</Text>
          </TouchableOpacity>
        )}
        {isLinkActive && canDeactivate && (
          <TouchableOpacity
            style={[sl.actionBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border }]}
            onPress={() => onDeactivate(link.id)}
            activeOpacity={0.8}
          >
            <Text style={[sl.actionBtnText, { color: colors.mutedForeground }]}>
              {t("deactivateLink" as never)}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Quotation Source Picker Modal ────────────────────────────────────────────
function QuotationPickerModal({
  visible,
  onClose,
  onPickImage,
  onPickDocument,
  colors,
  t,
  isRTL,
}: {
  visible: boolean;
  onClose: () => void;
  onPickImage: () => void;
  onPickDocument: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={qp.overlay}>
          <TouchableWithoutFeedback>
            <View style={[qp.sheet, { backgroundColor: colors.card }]}>
              <View style={[qp.titleRow, isRTL && { flexDirection: "row-reverse" }]}>
                <Text style={[qp.title, { color: colors.text }]}>
                  {t("addQuotation" as never)}
                </Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="close" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[qp.option, isRTL && { flexDirection: "row-reverse" }]}
                onPress={onPickImage}
                activeOpacity={0.7}
              >
                <Icon name="image" size={22} color={colors.primary} />
                <Text style={[qp.optionText, { color: colors.text }]}>
                  {t("imageFromGallery" as never)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[qp.option, isRTL && { flexDirection: "row-reverse" }]}
                onPress={onPickDocument}
                activeOpacity={0.7}
              >
                <Icon name="file-doc" size={22} color={colors.primary} />
                <Text style={[qp.optionText, { color: colors.text }]}>
                  {t("documentPdfWord" as never)}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const qp = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderRadius: 10,
    paddingHorizontal: 6,
  },
  optionText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});

// ── WorkflowActionBanner ──────────────────────────────────────────────────────
function WorkflowActionBanner({
  requestId,
  status,
  userRole,
  isSuperAdmin,
  colors,
  t,
  isRTL,
}: {
  requestId: string;
  status: string;
  userRole: string;
  isSuperAdmin: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const { showError, showDialog } = useDialog();
  const [comment, setComment] = useState("");
  const [acting, setActing] = useState(false);

  const ACTION_MAP: Record<string, { approve: string; reject: string }> = {
    planning_review: { approve: "planning_approve", reject: "planning_reject" },
    finance_review:  { approve: "finance_approve",  reject: "finance_reject" },
    evp_review:      { approve: "evp_approve",      reject: "evp_reject" },
    ceo_review:      { approve: "ceo_approve",      reject: "ceo_reject" },
  };
  const ROLE_FOR_STATUS: Record<string, string> = {
    planning_review: "planning",
    finance_review:  "finance",
    evp_review:      "evp",
    ceo_review:      "ceo",
  };

  const actions = ACTION_MAP[status];
  if (!actions) return null;
  const requiredRole = ROLE_FOR_STATUS[status];
  if (!isSuperAdmin && userRole !== requiredRole) return null;

  const act = async (action: string) => {
    setActing(true);
    try {
      await apiPost(`/api/procurement/workflow/${requestId}/advance`, {
        action,
        comment: comment.trim() || null,
      });
      showDialog({
        title: action.endsWith("_approve") ? t("workflowApproved" as never) : t("workflowRejected" as never),
        message: "",
        type: action.endsWith("_approve") ? "success" : "warning",
      });
      setComment("");
    } catch (err) {
      showError((err as Error).message, t("error" as never));
    } finally {
      setActing(false);
    }
  };

  return (
    <View style={[sl.actionBanner, { backgroundColor: colors.primary + "08", borderColor: colors.primary + "30" }]}>
      <View style={[sl.bannerHeader, isRTL && { flexDirection: "row-reverse" }]}>
        <Icon name="shield-check" size={16} color={colors.primary} />
        <Text style={[sl.bannerTitle, { color: colors.primary }]}>
          {t("workflowActionRequired" as never)}
        </Text>
      </View>
      <TextInput
        style={[
          sl.bannerInput,
          { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
        ]}
        value={comment}
        onChangeText={setComment}
        placeholder={t("approvalCommentPlaceholder" as never)}
        placeholderTextColor={colors.mutedForeground}
        textAlign={isRTL ? "right" : "left"}
        editable={!acting}
        multiline
        numberOfLines={2}
      />
      <View style={[sl.bannerBtns, isRTL && { flexDirection: "row-reverse" }]}>
        <TouchableOpacity
          style={[sl.bannerApproveBtn, { backgroundColor: "#16A34A" }, acting && { opacity: 0.6 }]}
          onPress={() => act(actions.approve)}
          disabled={acting}
          activeOpacity={0.8}
        >
          {acting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={sl.bannerBtnText}>{t("approveAction" as never)}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[sl.bannerRejectBtn, { borderColor: "#DC2626" }, acting && { opacity: 0.6 }]}
          onPress={() => act(actions.reject)}
          disabled={acting}
          activeOpacity={0.8}
        >
          <Text style={[sl.bannerBtnText, { color: "#DC2626" }]}>{t("rejectAction" as never)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Super Admin early-stage override ─────────────────────────────────────────
// Shown only to super_admin at the 4 procurement phases before quotation_selected.
// Each phase maps to one API action that advances to the next stage.

const SA_EARLY_ADVANCE: Record<string, { action: string; toStatus: string; labelKey: string }> = {
  pending_procurement:         { action: "sa_advance_to_awaiting_quotations", toStatus: "awaiting_quotations",        labelKey: "stageAwaitingQuotations" },
  awaiting_quotations:         { action: "sa_advance_to_quotations_received", toStatus: "quotations_received",         labelKey: "stageQuotationsReceived" },
  quotations_received:         { action: "sa_advance_to_pending_selection",   toStatus: "pending_requester_selection", labelKey: "stagePendingRequesterSelection" },
  pending_requester_selection: { action: "sa_advance_to_quotation_selected",  toStatus: "quotation_selected",          labelKey: "stageQuotationSelected" },
};

function SuperAdminEarlyAdvance({
  requestId,
  status,
  colors,
  t,
  isRTL,
}: {
  requestId: string;
  status: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const { showConfirm, showError } = useDialog();
  const [acting, setActing] = useState(false);
  const entry = SA_EARLY_ADVANCE[status];
  if (!entry) return null;

  const act = () => {
    showConfirm({
      title: t("superAdminOverride" as never),
      message: `${t("advanceToStage" as never)}: ${t(entry.labelKey as never)}`,
      confirmText: t("confirm" as never),
      onConfirm: async () => {
        setActing(true);
        try {
          await apiPost(`/api/procurement/workflow/${requestId}/advance`, {
            action: entry.action,
            comment: "Super Admin override",
          });
        } catch (err) {
          showError((err as Error).message, t("error" as never));
        } finally {
          setActing(false);
        }
      },
    });
  };

  return (
    <View style={[sl.actionBanner, { backgroundColor: "#BC9B5D12", borderColor: "#BC9B5D40" }]}>
      <View style={[sl.bannerHeader, isRTL && { flexDirection: "row-reverse" }]}>
        <Icon name="shield-check" size={16} color="#BC9B5D" />
        <Text style={[sl.bannerTitle, { color: "#BC9B5D" }]}>
          {t("superAdminOverride" as never)}
        </Text>
      </View>
      <Text style={[sl.bannerDesc, { color: colors.mutedForeground }]}>
        {t("superAdminOverrideDesc" as never)}
      </Text>
      <TouchableOpacity
        style={[sl.bannerApproveBtn, { backgroundColor: "#BC9B5D" }, acting && { opacity: 0.6 }]}
        onPress={act}
        disabled={acting}
        activeOpacity={0.8}
      >
        {acting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={sl.bannerBtnText}>
            {t("advanceToStage" as never)}: {t(entry.labelKey as never)} →
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProcurementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t, isRTL, language } = useT();
  const { profile, user, isAdmin, isSuperAdmin } = useAuth();
  const { showError, showSuccess, showConfirm, showDialog } = useDialog();
  const { deleteRequest } = useProcurementRequests();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [request, setRequest] = useState<ProcurementRequest | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [loadingRequest, setLoadingRequest] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [uploadingQuotation, setUploadingQuotation] = useState(false);
  const [sendingToRequester, setSendingToRequester] = useState(false);
  const [approvingQuotation, setApprovingQuotation] = useState(false);
  const [localSelectedQuotationId, setLocalSelectedQuotationId] = useState<string | null>(null);
  const [localSelectedSupplierResponseId, setLocalSelectedSupplierResponseId] = useState<string | null>(null);
  const [approvingSupplierQuotation, setApprovingSupplierQuotation] = useState(false);
  const [pendingQuotation, setPendingQuotation] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
  } | null>(null);
  const [quotationPickerVisible, setQuotationPickerVisible] = useState(false);
  const [sapPrInput, setSapPrInput] = useState("");
  const [sapPoInput, setSapPoInput] = useState("");
  const [editingSap, setEditingSap] = useState(false);
  const [savingSap, setSavingSap] = useState(false);

  const [supplierLinks, setSupplierLinks] = useState<SupplierLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkHint, setLinkHint] = useState("");
  const [linksRefreshKey, setLinksRefreshKey] = useState(0);
  const refreshLinks = useCallback(() => setLinksRefreshKey((k) => k + 1), []);

  const [selectedResponseIds, setSelectedResponseIds] = useState<Set<string>>(new Set());
  const [viewingResponse, setViewingResponse] = useState<SupplierResponse | null>(null);
  const [forwardingResponses, setForwardingResponses] = useState(false);

  const pickingRef = useRef(false);

  // ── Real-time request subscription ─────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    setLoadingRequest(true);
    const unsub = onSnapshot(
      doc(db, "procurement_requests", id),
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
        } else {
          const data = { id: snap.id, ...snap.data() } as ProcurementRequest;
          setRequest(data);
          if (!editingSap) {
            setSapPrInput(data.prNumber ?? "");
            setSapPoInput(data.poNumber ?? "");
          }
        }
        setLoadingRequest(false);
      },
      (err) => {
        console.error("[ProcDetail] subscribe:", err.message);
        setNotFound(true);
        setLoadingRequest(false);
      }
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Workflow events subscription ────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    setLoadingEvents(true);
    const q = query(
      collection(db, "workflow_events"),
      where("requestId", "==", id),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkflowEvent)));
        setLoadingEvents(false);
      },
      (err) => {
        console.warn("[ProcDetail] events:", err.code);
        setLoadingEvents(false);
      }
    );
    return unsub;
  }, [id]);

  // ── Derived permissions ─────────────────────────────────────────────────────

  const isCreator = profile?.uid === request?.createdByUid;
  const isProcurementRole = profile?.role === "procurement" || isSuperAdmin;
  const canUploadQuotations = isProcurementRole;

  // Quotation selection is only valid at this workflow stage
  const isAtSelectionStage = request?.status === "pending_requester_selection";
  const selectionNotYetMade = !request?.selectedQuotationAttachmentId && !request?.selectedSupplierResponseId;

  // Creator (including CEO or any admin who happens to be the original requester)
  // can select their own quotation when the request is at the selection stage.
  const canSelectQuotation = isCreator && isAtSelectionStage && selectionNotYetMade;

  // Super Admin explicit override: SA who is NOT the creator can still force-select.
  const canSAOverrideSelect = isSuperAdmin && !isCreator && isAtSelectionStage && selectionNotYetMade;

  const canManageSAP = isProcurementRole;

  // Debug log — remove after confirming selection works
  if (__DEV__ && request) {
    console.log(
      "[QuotSel] uid:", user?.uid,
      "| createdByUid:", request.createdByUid,
      "| role:", profile?.role,
      "| isSuperAdmin:", isSuperAdmin,
      "| isAdmin:", isAdmin,
      "| isCreator:", isCreator,
      "| status:", request.status,
      "| isAtSelectionStage:", isAtSelectionStage,
      "| canSelectQuotation:", canSelectQuotation,
      "| canSAOverrideSelect:", canSAOverrideSelect,
      "| selectedQuotationAttachmentId exists:", !!request.selectedQuotationAttachmentId,
    );
  }

  const canView =
    isAdmin || isCreator;

  const dateCreated = useMemo(
    () => (request ? formatTs(request.createdAt, isRTL) : ""),
    [request, isRTL]
  );

  const quotations = (request?.quotationAttachments ?? []) as QuotationAttachment[];
  const requesterAtts = (request?.attachments ?? []) as StoredAttachment[];

  const forwardedResponses = supplierLinks
    .filter((link) => link.response?.reviewStatus === "forwarded")
    .map((link) => link.response!);

  // Procurement can "Send to Requester" from any of these stages.
  // "draft" included for backward-compat with records created before the
  // pending_procurement default was introduced.
  const PRE_SELECTION_STATUSES = [
    "draft",
    "pending_procurement",
    "awaiting_quotations",
    "quotations_received",
  ] as const;
  const canSendToRequester =
    canUploadQuotations &&
    quotations.length > 0 &&
    !!request &&
    PRE_SELECTION_STATUSES.includes(request.status as typeof PRE_SELECTION_STATUSES[number]);

  // ── Supplier links fetch ────────────────────────────────────────────────────

  useEffect(() => {
    if (!id || (!isProcurementRole && !isCreator)) return;
    let cancelled = false;
    console.log("[refreshLinks] requestId:", id, "key:", linksRefreshKey);
    setLoadingLinks(true);
    console.log("[Cloudflare Procurement API] GET /api/procurement/supplier-links/" + id);
    cfApiGet<{ links: SupplierLink[] }>(`/api/procurement/supplier-links/${id}`)
      .then(({ links }) => {
        console.log("[refreshLinks] returned links:", links.length);
        if (!cancelled) setSupplierLinks(links);
      })
      .catch((err: Error) => {
        console.warn("[refreshLinks] GET failed:", err.message);
      })
      .finally(() => { if (!cancelled) setLoadingLinks(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, linksRefreshKey, isProcurementRole, isCreator]);

  useEffect(() => {
    console.log("[SupplierLinks] rendered count:", supplierLinks.length);
  }, [supplierLinks]);

  // ── Auto-refresh supplier links every 12 seconds ────────────────────────────

  useEffect(() => {
    if (!id || (!isProcurementRole && !isCreator)) return;
    const interval = setInterval(() => setLinksRefreshKey((k) => k + 1), 12000);
    return () => clearInterval(interval);
  }, [id, isProcurementRole, isCreator]);

  // ── Quotation upload ────────────────────────────────────────────────────────

  const uploadQuotation = async (uri: string, fileName: string, mimeType: string) => {
    if (!id || !user || !profile) return;
    setUploadingQuotation(true);
    try {
      const result = await uploadToCloudinary(uri, fileName, mimeType, {
        folder: `afal/requests/${id}`,
      });
      const newQ: QuotationAttachment = {
        id: `q_${Date.now()}`,
        name: result.fileName,
        customLabel: null,
        url: result.fileUrl,
        type: result.fileType,
        size: result.size,
        uploadedAt: new Date().toISOString(),
        uploadedByUid: user.uid,
        uploadedByName: profile.displayName,
      };
      const existing = quotations;
      await updateDoc(doc(db, "procurement_requests", id), {
        quotationAttachments: [...existing, newQ],
        updatedAt: serverTimestamp(),
      });
      try {
        await addDoc(collection(db, "workflow_events"), {
          requestId: id,
          requestCreatorUid: request?.createdByUid ?? null,
          actorUid: user.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          eventType: "quotation_uploaded",
          fromStage: null,
          toStage: null,
          comment: `Quotation uploaded: ${result.fileName}`,
          attachments: [],
          createdAt: serverTimestamp(),
          metadata: null,
        });
      } catch {
        // workflow event is non-critical
      }
    } catch (err) {
      showError((err as Error).message || t("errUpload"), t("error"));
    } finally {
      setUploadingQuotation(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!pendingQuotation) return;
    const { uri, name, mimeType } = pendingQuotation;
    setPendingQuotation(null);
    await uploadQuotation(uri, name, mimeType);
  };

  const handleAddQuotation = () => {
    if (!canUploadQuotations) return;
    setQuotationPickerVisible(true);
  };

  const pickImageForQuotation = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setQuotationPickerVisible(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showError(t("permissionDenied"), t("error"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setPendingQuotation({
        uri: asset.uri,
        name: asset.fileName || `quotation_${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
        size: asset.fileSize ?? undefined,
      });
    } catch {
      showError(t("errGeneric"), t("error"));
    } finally {
      pickingRef.current = false;
    }
  };

  const pickDocumentForQuotation = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setQuotationPickerVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      // Fix 2: guess MIME type from extension when picker returns octet-stream
      let mimeType = asset.mimeType || "application/octet-stream";
      if (mimeType === "application/octet-stream") {
        const ext = asset.name.split(".").pop()?.toLowerCase();
        if (ext === "pdf") mimeType = "application/pdf";
        else if (ext === "doc") mimeType = "application/msword";
        else if (ext === "docx") mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
        else if (ext === "png") mimeType = "image/png";
        else if (ext === "xls") mimeType = "application/vnd.ms-excel";
        else if (ext === "xlsx") mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      }
      setPendingQuotation({
        uri: asset.uri,
        name: asset.name,
        mimeType,
        size: asset.size ?? undefined,
      });
    } catch {
      showError(t("errGeneric"), t("error"));
    } finally {
      pickingRef.current = false;
    }
  };

  // ── Send quotations to requester (procurement action) ──────────────────────

  const handleSendToRequester = () => {
    if (!quotations.length) {
      showError(t("selectQuotationFirst"), t("error"));
      return;
    }
    showConfirm({
      title: t("sendQuotationsToRequester"),
      message: t("sendQuotationsToRequesterConfirm"),
      confirmText: t("submitApproval"),
      onConfirm: async () => {
        setSendingToRequester(true);
        try {
          await apiPost(`/api/procurement/workflow/${id}/advance`, {
            action: "send_quotations_to_requester",
            comment: null,
          });
          showSuccess(t("sendQuotationsSuccess"), t("success"));
        } catch (err) {
          showError((err as Error).message, t("error"));
        } finally {
          setSendingToRequester(false);
        }
      },
    });
  };

  // ── Approve selected quotation (requester / SA action) ──────────────────────
  // Two-step: user taps radio (sets localSelectedQuotationId), then taps Approve.
  // The API call writes selectedQuotationAttachmentId + approvedAttachment + status
  // via Admin SDK so the status transition isn't blocked by Firestore rules.

  const handleApproveQuotation = () => {
    if (!id || !localSelectedQuotationId) return;
    const quotation = quotations.find((q) => q.id === localSelectedQuotationId);
    if (!quotation) return;
    const isSAOverride = canSAOverrideSelect;
    showConfirm({
      title: isSAOverride ? t("superAdminOverride") : t("approveSelectedQuotation"),
      message: isSAOverride
        ? `Override: select "${quotation.customLabel ?? quotation.name}" on behalf of the requester?`
        : t("approveSelectedQuotationConfirm"),
      confirmText: t("submitApproval"),
      destructive: isSAOverride,
      onConfirm: async () => {
        setApprovingQuotation(true);
        try {
          await apiPost(`/api/procurement/workflow/${id}/approve-quotation`, {
            quotationId: quotation.id,
            quotation,
          });
          setLocalSelectedQuotationId(null);
          showSuccess(t("quotationApprovedSuccess"), t("success"));
        } catch (err) {
          showError((err as Error).message, t("error"));
        } finally {
          setApprovingQuotation(false);
        }
      },
    });
  };

  // ── Approve selected supplier quotation (requester / SA action) ─────────────

  const handleApproveSupplierQuotation = () => {
    if (!id || !localSelectedSupplierResponseId) return;
    const resp = forwardedResponses.find((r) => r.id === localSelectedSupplierResponseId);
    if (!resp) return;
    const isSAOverride = canSAOverrideSelect;
    showConfirm({
      title: isSAOverride ? t("superAdminOverride") : t("approveSupplierQuotation"),
      message: isSAOverride
        ? `Override: select quotation from "${resp.companyName ?? resp.id}" on behalf of the requester?`
        : t("approveSupplierQuotationConfirm"),
      confirmText: t("submitApproval"),
      destructive: isSAOverride,
      onConfirm: async () => {
        setApprovingSupplierQuotation(true);
        try {
          const body = { selectedSupplierResponseId: resp.id };
          console.log("[approve supplier] selectedSupplierResponseId", resp.id);
          console.log("[approve supplier] body", JSON.stringify(body));
          await apiPost(`/api/procurement/workflow/${id}/approve-quotation`, body);
          setLocalSelectedSupplierResponseId(null);
          showSuccess(t("supplierQuotationApprovedSuccess"), t("success"));
        } catch (err) {
          showError((err as Error).message, t("error"));
        } finally {
          setApprovingSupplierQuotation(false);
        }
      },
    });
  };

  // ── SAP save ───────────────────────────────────────────────────────────────

  const handleSaveSap = async () => {
    if (!id) return;
    setSavingSap(true);
    try {
      await updateDoc(doc(db, "procurement_requests", id), {
        prNumber: sapPrInput.trim() || null,
        poNumber: sapPoInput.trim() || null,
        updatedAt: serverTimestamp(),
      });
      setEditingSap(false);
      showSuccess(t("sapInfoSaved"), t("success"));
    } catch {
      showError(t("errGeneric"), t("error"));
    } finally {
      setSavingSap(false);
    }
  };

  // ── Supplier link actions ───────────────────────────────────────────────────

  const handleGenerateLink = async () => {
    if (!id) return;
    setGeneratingLink(true);
    try {
      console.log("[Cloudflare Procurement API] POST /api/procurement/supplier-links requestId:", id);
      const result = await cfApiPost<{
        id: string;
        token: string;
        requestId: string;
        supplierNameHint: string | null;
        expiresAt: { seconds: number; nanoseconds: number } | null;
      }>("/api/procurement/supplier-links", {
        requestId: id,
        supplierNameHint: linkHint.trim() || null,
      });
      console.log("[handleGenerateLink] POST response:", JSON.stringify(result));
      if (!result.id || !result.token) {
        showError("Server returned an invalid link response.", t("error"));
        return;
      }
      setLinkHint("");
      const newLink: SupplierLink = {
        id: result.id,
        token: result.token,
        requestId: result.requestId,
        supplierNameHint: result.supplierNameHint,
        createdByUid: user?.uid ?? "",
        isActive: true,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
        expiresAt: result.expiresAt ?? null,
        submittedAt: null,
        responseId: null,
        response: null,
      };
      setSupplierLinks((prev) => [newLink, ...prev]);
      refreshLinks();
      showSuccess(t("linkGeneratedSuccess"), t("success"));
    } catch (err) {
      showError((err as Error).message, t("error"));
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleShareLink = async (url: string, hint: string | null) => {
    try {
      await Share.share({ message: url, title: hint ?? undefined });
    } catch {
      showDialog({ title: hint ?? t("supplierLinkSection"), message: url, type: "info" });
    }
  };

  const handleDeactivateLink = (linkId: string) => {
    showConfirm({
      title: t("deactivateLink"),
      message: "",
      confirmText: t("deactivateLink"),
      destructive: true,
      onConfirm: async () => {
        try {
          console.log("[Cloudflare Procurement API] POST /api/procurement/supplier-links/" + linkId + "/deactivate");
          await cfApiPost(`/api/procurement/supplier-links/${linkId}/deactivate`, {});
          refreshLinks();
        } catch (err) {
          showError((err as Error).message, t("error"));
        }
      },
    });
  };

  const handleForwardSelectedResponses = () => {
    const ids = Array.from(selectedResponseIds);
    if (ids.length === 0) {
      showError(t("noResponsesSelected"), t("error"));
      return;
    }
    showConfirm({
      title: t("sendSelectedToRequester"),
      message: t("sendSelectedToRequesterConfirm"),
      confirmText: t("submitApproval"),
      onConfirm: async () => {
        setForwardingResponses(true);
        try {
          console.log("[Cloudflare Procurement API] POST /api/procurement/supplier-responses/" + id + "/forward ids:", ids);
          await cfApiPost(`/api/procurement/supplier-responses/${id}/forward`, {
            responseIds: ids,
          });
          setSelectedResponseIds(new Set());
          showSuccess(t("sendSelectedSuccess"), t("success"));
        } catch (err) {
          showError((err as Error).message, t("error"));
        } finally {
          setForwardingResponses(false);
        }
      },
    });
  };

  const handleAdvanceToBudget = () => {
    showConfirm({
      title: t("sendToBudgetWorkflow"),
      message: t("sendToBudgetWorkflowConfirm"),
      confirmText: t("submitApproval"),
      onConfirm: async () => {
        try {
          await apiPost(`/api/procurement/workflow/${id}/advance`, {
            action: "procurement_advance",
            comment: null,
          });
        } catch (err) {
          showError((err as Error).message, t("error"));
        }
      },
    });
  };

  // ── Loading / not found ─────────────────────────────────────────────────────

  if (loadingRequest) {
    return (
      <View style={[sc.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (notFound || !request || !canView) {
    return (
      <View style={[sc.center, { backgroundColor: colors.background }]}>
        <Icon name="alert-circle" size={48} color={colors.mutedForeground} />
        <Text style={[sc.notFoundText, { color: colors.foreground }]}>
          {t("requestNotFound")}
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium" }}>
            {t("goBack")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[sc.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          sc.header,
          {
            backgroundColor: colors.primary,
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={sc.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={sc.headerTitle} numberOfLines={1}>
          {request.requestNumber ?? request.title}
        </Text>
        {isSuperAdmin && !request.isTerminated ? (
          <TouchableOpacity
            style={sc.trashBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() =>
              showConfirm({
                title: language === "ar" ? "إنهاء هذا الطلب؟" : "Terminate This Request?",
                message: language === "ar"
                  ? "سيتم تحديد الطلب كمنهي."
                  : "The request will be marked as terminated.",
                confirmText: language === "ar" ? "إنهاء" : "Terminate",
                cancelText: language === "ar" ? "إلغاء" : "Cancel",
                destructive: true,
                onConfirm: async () => {
                  try {
                    await deleteRequest(id!);
                    router.back();
                  } catch {
                    showError(
                      language === "ar" ? "تعذّر إنهاء الطلب." : "Failed to terminate.",
                      language === "ar" ? "خطأ" : "Error"
                    );
                  }
                },
              })
            }
          >
            <Icon name="trash" size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 30 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[sc.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* ── Section A: RFQ Details ─────────────────────────────────────── */}
        <SectionCard icon="file-doc" label={t("rfqDetailsSection")} colors={colors}>
          <View style={[sc.rfqTitleRow, isRTL && { flexDirection: "row-reverse" }]}>
            <RFQIconBadge />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[sc.rfqTitle, { color: colors.foreground }]}>{request.title}</Text>
              <View style={[sc.badgeRow, isRTL && { flexDirection: "row-reverse" }]}>
                <ProcurementStageBadge stage={request.status} />
                {request.requestNumber ? (
                  <Text style={[sc.reqNum, { color: colors.primary }]}>
                    {request.requestNumber}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={[sc.divider, { backgroundColor: colors.border }]} />
          <InfoRow label={t("rfqSubmittedBy")} value={request.createdByName} colors={colors} />
          <InfoRow label={t("rfqGroupOrRequesterDisplay")} value={request.groupOrRequesterName} colors={colors} />
          <InfoRow label={t("requestedAt")} value={dateCreated} colors={colors} />

          <View style={[sc.divider, { backgroundColor: colors.border }]} />
          <Text style={[sc.descLabel, { color: colors.mutedForeground }]}>
            {t("rfqProductDescription").toUpperCase()}
          </Text>
          <Text style={[sc.description, { color: colors.foreground }]}>
            {request.productDescription}
          </Text>

          {requesterAtts.length > 0 && (
            <>
              <View style={[sc.divider, { backgroundColor: colors.border }]} />
              <Text style={[sc.descLabel, { color: colors.mutedForeground }]}>
                {t("rfqAttachmentsSection").toUpperCase()}
              </Text>
              {requesterAtts.map((att, i) => (
                <View
                  key={i}
                  style={[sc.attCard, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  <AttachmentViewer
                    attachment={{ fileName: att.name, url: att.url, fileType: att.type, size: att.size }}
                    iconColor={colors.primary}
                    textColor={colors.foreground}
                  />
                  {(att.size || att.uploadedAt) && (
                    <Text style={[sc.attMeta, { color: colors.mutedForeground }]}>
                      {[att.size ? formatFileSize(att.size) : null, att.uploadedAt ? formatDateShort(att.uploadedAt, isRTL) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  )}
                </View>
              ))}
            </>
          )}
        </SectionCard>

        {/* ── Section B: Quotation Attachments (procurement only) ─────────── */}
        {canUploadQuotations && (
          <SectionCard
            icon="paperclip"
            label={t("quotationSection")}
            badge={t("procurementOnlySection")}
            colors={colors}
          >
            <Text style={[sc.sectionDesc, { color: colors.mutedForeground }]}>
              {t("quotationSectionDesc")}
            </Text>

            {quotations.length > 0 && (
              <View style={{ gap: 8, marginTop: 8 }}>
                {quotations.map((q, i) => (
                  <QuotationCard
                    key={q.id}
                    quotation={q}
                    index={i}
                    colors={colors}
                    t={t as never}
                    isRTL={isRTL}
                  />
                ))}
              </View>
            )}

            {/* ── Pending file preview card ─────────────────────────────── */}
            {pendingQuotation && (
              <View style={[sc.pendingCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={[sc.pendingRow, isRTL && { flexDirection: "row-reverse" }]}>
                  <Icon
                    name={pendingQuotation.mimeType.startsWith("image/") ? "image" : "file-doc"}
                    size={22}
                    color={colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[sc.pendingName, { color: colors.text }]} numberOfLines={2}>
                      {pendingQuotation.name}
                    </Text>
                    {pendingQuotation.size !== undefined && (
                      <Text style={[sc.pendingSize, { color: colors.mutedForeground }]}>
                        {formatFileSize(pendingQuotation.size)}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => setPendingQuotation(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="close" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
                <View style={[sc.pendingActions, isRTL && { flexDirection: "row-reverse" }]}>
                  <TouchableOpacity
                    style={[sc.pendingCancelBtn, { borderColor: colors.border }]}
                    onPress={() => setPendingQuotation(null)}
                  >
                    <Text style={[sc.pendingCancelText, { color: colors.mutedForeground }]}>
                      {t("cancel")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[sc.pendingUploadBtn, { backgroundColor: colors.primary }]}
                    onPress={handleConfirmUpload}
                    disabled={uploadingQuotation}
                  >
                    {uploadingQuotation ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={sc.pendingUploadText}>{t("uploadQuotation")}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!pendingQuotation && (
              <TouchableOpacity
                style={[sc.addQuotationBtn, { borderColor: colors.primary }]}
                onPress={handleAddQuotation}
                disabled={uploadingQuotation}
                activeOpacity={0.75}
              >
                {uploadingQuotation ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <>
                    <Icon name="plus" size={18} color={colors.primary} />
                    <Text style={[sc.addQuotationText, { color: colors.primary }]}>
                      {t("addQuotation")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* ── Send Quotations to Requester ──────────────────────────── */}
            {canSendToRequester && !pendingQuotation && (
              <TouchableOpacity
                style={[sc.sendToRequesterBtn, { backgroundColor: colors.primary }]}
                onPress={handleSendToRequester}
                disabled={sendingToRequester}
                activeOpacity={0.85}
              >
                {sendingToRequester ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Icon name="send" size={15} color="#fff" />
                    <Text style={sc.sendToRequesterText}>
                      {t("sendQuotationsToRequester")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </SectionCard>
        )}

        {/* ── Section C: Requester Quotation Selection ────────────────────── */}
        {/* Shown at pending_requester_selection — covers both legacy quotations and forwarded supplier responses */}
        {(quotations.length > 0 || forwardedResponses.length > 0) && (isCreator || isSuperAdmin) && isAtSelectionStage && (
          <SectionCard icon="check-circle" label={t("selectQuotationPrompt")} colors={colors}>
            {canSAOverrideSelect && (
              <Text style={[sc.sectionDesc, { color: colors.accent, marginBottom: 6 }]}>
                {"⚠ Super Admin — selecting on behalf of the requester"}
              </Text>
            )}
            <Text style={[sc.sectionDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>
              {canSelectQuotation || canSAOverrideSelect
                ? t("quotationSectionDesc")
                : t("quotationSelectedLabel")}
            </Text>

            {/* Legacy manually-uploaded quotations */}
            {quotations.length > 0 && (
              <View style={{ gap: 8 }}>
                {quotations.map((q, i) => {
                  const thisCanSelect = canSelectQuotation || canSAOverrideSelect;
                  const effectiveSelectedId = request.selectedQuotationAttachmentId ?? localSelectedQuotationId;
                  return (
                    <SelectableQuotationCard
                      key={q.id}
                      quotation={q}
                      index={i}
                      selected={effectiveSelectedId === q.id}
                      canSelect={thisCanSelect}
                      onSelect={() => {
                        if (!thisCanSelect) return;
                        setLocalSelectedQuotationId(q.id);
                        setLocalSelectedSupplierResponseId(null);
                      }}
                      colors={colors}
                      t={t as never}
                      isRTL={isRTL}
                    />
                  );
                })}
              </View>
            )}

            {/* Forwarded supplier quotations */}
            {forwardedResponses.length > 0 && (
              <View style={{ gap: 8, marginTop: quotations.length > 0 ? 12 : 0 }}>
                {quotations.length > 0 && (
                  <Text style={[sc.sectionDesc, { color: colors.primary, fontFamily: "Inter_700Bold", marginBottom: 4 }]}>
                    {t("supplierQuotationSection")}
                  </Text>
                )}
                {forwardedResponses.map((resp, i) => {
                  const thisCanSelect = canSelectQuotation || canSAOverrideSelect;
                  const effectiveSelectedSRId = request.selectedSupplierResponseId ?? localSelectedSupplierResponseId;
                  return (
                    <SelectableSupplierResponseCard
                      key={resp.id}
                      response={resp}
                      index={i}
                      selected={effectiveSelectedSRId === resp.id}
                      canSelect={thisCanSelect}
                      onSelect={() => {
                        if (!thisCanSelect) return;
                        setLocalSelectedSupplierResponseId(resp.id);
                        setLocalSelectedQuotationId(null);
                      }}
                      onViewDetails={setViewingResponse}
                      colors={colors}
                      t={t as never}
                      isRTL={isRTL}
                    />
                  );
                })}
              </View>
            )}

            {/* Approve legacy quotation */}
            {(canSelectQuotation || canSAOverrideSelect) && localSelectedQuotationId && !localSelectedSupplierResponseId && (
              <TouchableOpacity
                style={[
                  sc.approveQuotationBtn,
                  { backgroundColor: canSAOverrideSelect ? colors.accent : colors.primary },
                  approvingQuotation && { opacity: 0.7 },
                ]}
                onPress={handleApproveQuotation}
                disabled={approvingQuotation}
                activeOpacity={0.85}
              >
                {approvingQuotation ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Icon name="check-circle" size={16} color="#fff" />
                    <Text style={sc.approveQuotationBtnText}>
                      {t("approveSelectedQuotation")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Approve supplier quotation */}
            {(canSelectQuotation || canSAOverrideSelect) && localSelectedSupplierResponseId && (
              <TouchableOpacity
                style={[
                  sc.approveQuotationBtn,
                  { backgroundColor: canSAOverrideSelect ? colors.accent : "#16A34A" },
                  approvingSupplierQuotation && { opacity: 0.7 },
                ]}
                onPress={handleApproveSupplierQuotation}
                disabled={approvingSupplierQuotation}
                activeOpacity={0.85}
              >
                {approvingSupplierQuotation ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Icon name="check-circle" size={16} color="#fff" />
                    <Text style={sc.approveQuotationBtnText}>
                      {t("approveSupplierQuotation")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </SectionCard>
        )}

        {/* Read-only quotation view: shown after selection is confirmed */}
        {quotations.length > 0 && (isCreator || isSuperAdmin) && !isAtSelectionStage && request.selectedQuotationAttachmentId && (
          <SectionCard icon="check-circle" label={t("selectQuotationPrompt")} colors={colors}>
            <Text style={[sc.sectionDesc, { color: colors.mutedForeground, marginBottom: 8 }]}>
              {t("quotationSelectedLabel")}
            </Text>
            <View style={{ gap: 8 }}>
              {quotations.map((q, i) => (
                <SelectableQuotationCard
                  key={q.id}
                  quotation={q}
                  index={i}
                  selected={request.selectedQuotationAttachmentId === q.id}
                  canSelect={false}
                  onSelect={() => {}}
                  colors={colors}
                  t={t as never}
                  isRTL={isRTL}
                />
              ))}
            </View>
          </SectionCard>
        )}

        {/* ── Super Admin Override: early procurement stages ──────────────── */}
        {isSuperAdmin && !request.isTerminated && SA_EARLY_ADVANCE[request.status] && (
          <SectionCard icon="shield-check" label={t("superAdminOverride" as never)} colors={colors}>
            <SuperAdminEarlyAdvance
              requestId={id!}
              status={request.status}
              colors={colors}
              t={t as never}
              isRTL={isRTL}
            />
          </SectionCard>
        )}

        {/* ── Section D: Approved Attachment ─────────────────────────────── */}
        {(request.approvedAttachment || request.selectedSupplierResponseId) && (
          <SectionCard icon="check-circle" label={t("approvedAttachmentSection")} colors={colors}>
            <ApprovedCard
              quotation={
                request.approvedAttachment
                  ? (request.approvedAttachment as { url?: string | null; name?: string | null; type?: string | null; customLabel?: string | null })
                  : { url: null, name: null, type: null, customLabel: null }
              }
              colors={colors}
              t={t as never}
              isRTL={isRTL}
            />
          </SectionCard>
        )}

        {/* ── Section E: Supplier Links ────────────────────────────────────── */}
        {/* Visible to Procurement/SA on any active (non-terminal) request.  */}
        {/* Phase 3 will add read-only response view for the original requester. */}
        {isProcurementRole && !["closed", "terminated"].includes(request.status) && (
          <SectionCard
            icon="send"
            label={t("supplierLinkSection")}
            badge={isProcurementRole ? t("procurementOnlySection") : undefined}
            colors={colors}
          >
            <Text style={[sc.sectionDesc, { color: colors.mutedForeground }]}>
              {t("supplierLinkSectionDesc")}
            </Text>

            {isProcurementRole && request.status === "quotation_selected" && (
              <TouchableOpacity
                style={[sl.advanceBtn, { backgroundColor: colors.primary }]}
                onPress={handleAdvanceToBudget}
                activeOpacity={0.85}
              >
                <Icon name="trending-up" size={15} color="#fff" />
                <Text style={sl.advanceBtnText}>{t("sendToBudgetWorkflow")}</Text>
              </TouchableOpacity>
            )}

            {isProcurementRole && (
              <View style={[sl.generateForm, { borderColor: colors.border }]}>
                <TextInput
                  style={[sl.hintInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  value={linkHint}
                  onChangeText={setLinkHint}
                  placeholder={t("supplierNameHintPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  textAlign={isRTL ? "right" : "left"}
                  editable={!generatingLink}
                />
                <TouchableOpacity
                  style={[sl.generateBtn, { backgroundColor: colors.secondary }, generatingLink && { opacity: 0.6 }]}
                  onPress={handleGenerateLink}
                  disabled={generatingLink}
                  activeOpacity={0.8}
                >
                  {generatingLink ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Icon name="plus" size={14} color="#fff" />
                      <Text style={sl.generateBtnText}>{t("generateLink")}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {loadingLinks ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
            ) : supplierLinks.length === 0 ? (
              isProcurementRole ? (
                <Text style={[sc.emptyText, { color: colors.mutedForeground }]}>
                  {t("noLinksYet")}
                </Text>
              ) : null
            ) : (
              supplierLinks.map((link) => (
                <SupplierLinkCard
                  key={link.id}
                  link={link}
                  onShare={handleShareLink}
                  onDeactivate={handleDeactivateLink}
                  canDeactivate={isProcurementRole}
                  onViewResponse={setViewingResponse}
                  isSelected={link.response ? selectedResponseIds.has(link.response.id) : false}
                  onToggleSelect={(responseId) => {
                    setSelectedResponseIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(responseId)) next.delete(responseId);
                      else next.add(responseId);
                      return next;
                    });
                  }}
                  colors={colors}
                  t={t as never}
                  isRTL={isRTL}
                />
              ))
            )}

            {/* Send Selected Responses to Requester */}
            {isProcurementRole && selectedResponseIds.size > 0 && (
              <TouchableOpacity
                style={[sc.sendToRequesterBtn, { backgroundColor: "#16A34A" }, forwardingResponses && { opacity: 0.6 }]}
                onPress={handleForwardSelectedResponses}
                disabled={forwardingResponses}
                activeOpacity={0.85}
              >
                {forwardingResponses ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Icon name="send" size={15} color="#fff" />
                    <Text style={sc.sendToRequesterText}>
                      {t("sendSelectedToRequester")} ({selectedResponseIds.size})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </SectionCard>
        )}

        {/* ── Section F: Budget Workflow ──────────────────────────────────── */}
        {(request.approvedAttachment ||
          ["planning_review", "finance_review", "evp_review", "ceo_review",
           "approved", "closed", "planning_rejected", "finance_rejected",
           "evp_rejected", "ceo_rejected"].includes(request.status)) && (
          <SectionCard icon="trending-up" label={t("budgetWorkflowSection")} colors={colors}>
            <Text style={[sc.sectionDesc, { color: colors.mutedForeground }]}>
              {t("approvedAttachmentDesc")}
            </Text>
            <BudgetWorkflow status={request.status} colors={colors} t={t as never} isRTL={isRTL} />
            {profile && (
              <WorkflowActionBanner
                requestId={id!}
                status={request.status}
                userRole={profile.role}
                isSuperAdmin={isSuperAdmin}
                colors={colors}
                t={t as never}
                isRTL={isRTL}
              />
            )}
          </SectionCard>
        )}

        {/* ── Section F: SAP PR (procurement only) ──────────────────────── */}
        {canManageSAP && (
          <SectionCard
            icon="file-doc"
            label={t("sapSection")}
            badge={t("procurementOnlySection")}
            colors={colors}
          >
            <Text style={[sc.sectionDesc, { color: colors.mutedForeground }]}>
              {t("sapSectionDesc")}
            </Text>

            <View style={sc.sapFields}>
              <View style={sc.sapFieldRow}>
                <Text style={[sc.sapFieldLabel, { color: colors.mutedForeground }]}>
                  {t("sapPrNumberLabel")}
                </Text>
                {editingSap ? (
                  <TextInput
                    style={[sc.sapInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={sapPrInput}
                    onChangeText={setSapPrInput}
                    placeholder={t("addSapPr")}
                    placeholderTextColor={colors.mutedForeground}
                    textAlign={isRTL ? "right" : "left"}
                  />
                ) : (
                  <Text style={[sc.sapValue, { color: request.prNumber ? colors.foreground : colors.mutedForeground }]}>
                    {request.prNumber ?? t("addSapPr")}
                  </Text>
                )}
              </View>

              <View style={sc.sapFieldRow}>
                <Text style={[sc.sapFieldLabel, { color: colors.mutedForeground }]}>
                  {t("sapPoNumberLabel")}
                </Text>
                {editingSap ? (
                  <TextInput
                    style={[sc.sapInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={sapPoInput}
                    onChangeText={setSapPoInput}
                    placeholder={t("addSapPo")}
                    placeholderTextColor={colors.mutedForeground}
                    textAlign={isRTL ? "right" : "left"}
                  />
                ) : (
                  <Text style={[sc.sapValue, { color: request.poNumber ? colors.foreground : colors.mutedForeground }]}>
                    {request.poNumber ?? t("addSapPo")}
                  </Text>
                )}
              </View>
            </View>

            {editingSap ? (
              <View style={sc.sapBtnRow}>
                <TouchableOpacity
                  style={[sc.sapSaveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSaveSap}
                  disabled={savingSap}
                >
                  {savingSap ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={sc.sapSaveBtnText}>{t("saveSapInfo")}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sc.sapCancelBtn, { borderColor: colors.border }]}
                  onPress={() => {
                    setEditingSap(false);
                    setSapPrInput(request.prNumber ?? "");
                    setSapPoInput(request.poNumber ?? "");
                  }}
                >
                  <Text style={[sc.sapCancelBtnText, { color: colors.mutedForeground }]}>
                    {t("cancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[sc.sapEditBtn, { borderColor: colors.primary + "40" }]}
                onPress={() => setEditingSap(true)}
              >
                <Icon name="document-text" size={13} color={colors.primary} />
                <Text style={[sc.sapEditBtnText, { color: colors.primary }]}>
                  {t("edit")}
                </Text>
              </TouchableOpacity>
            )}

            <SapSteps
              prNumber={request.prNumber}
              poNumber={request.poNumber}
              colors={colors}
              t={t as never}
              isRTL={isRTL}
            />
          </SectionCard>
        )}

        {/* ── Timeline ──────────────────────────────────────────────────── */}
        <SectionCard icon="clock" label={t("rfqTimeline")} colors={colors}>
          {loadingEvents ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : events.length === 0 ? (
            <Text style={[sc.emptyText, { color: colors.mutedForeground }]}>
              {t("noWorkflowEvents")}
            </Text>
          ) : (
            events.map((ev, i) => (
              <TimelineEvent
                key={ev.id}
                event={ev}
                isLast={i === events.length - 1}
                colors={colors}
                isRTL={isRTL}
              />
            ))
          )}
        </SectionCard>
      </ScrollView>

      <QuotationPickerModal
        visible={quotationPickerVisible}
        onClose={() => setQuotationPickerVisible(false)}
        onPickImage={pickImageForQuotation}
        onPickDocument={pickDocumentForQuotation}
        colors={colors}
        t={t as never}
        isRTL={isRTL}
      />

      <SupplierResponseDetailModal
        response={viewingResponse}
        onClose={() => setViewingResponse(null)}
        colors={colors}
        t={t as never}
        isRTL={isRTL}
      />
    </View>
  );
}

// ─── Sub-component Styles ──────────────────────────────────────────────────────

const sub = StyleSheet.create({
  rfqBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#2D6491",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    gap: 3,
  },
  rfqBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  rfqLines: { gap: 2, width: 24 },
  rfqLine: { height: 2, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 1, width: "100%" },

  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  sectionBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sectionBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 2, textAlign: "right" },

  quotationCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  qcIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  qcContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  qcLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  qcFilename: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
    opacity: 0.7,
  },
  qcMeta: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
  },
  qcActions: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    flexShrink: 0,
  },
  qcActionBtn: {
    padding: 6,
    borderRadius: 6,
  },
  qcCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  approvedCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  approvedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  approvedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  approvedName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  approvedMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 2,
  },
  approvedFilename: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
    opacity: 0.75,
  },
  approvedViewBtn: { marginTop: 4 },

  wfRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  wfItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  wfStage: {
    alignItems: "center",
    gap: 6,
    width: 72,
  },
  wfCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  wfLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 15,
  },
  wfArrow: {
    paddingHorizontal: 4,
    marginBottom: 18,
  },
});

const tl = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, marginTop: 8 },
  left: { alignItems: "center", width: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  line: { flex: 1, width: 2, marginTop: 4 },
  card: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    marginBottom: 4,
  },
  eventType: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  actor: { fontSize: 12, fontFamily: "Inter_400Regular" },
  comment: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  date: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
});

const sc = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 32,
  },
  notFoundText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  trashBtn: { padding: 4 },
  scroll: { padding: 16, gap: 14 },

  rfqTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  rfqTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    lineHeight: 26,
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  reqNum: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  descLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  attCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 4,
  },
  attMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 10,
    paddingBottom: 2,
  },
  sectionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginTop: -4,
  },
  quotationsRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  addQuotationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 14,
  },
  addQuotationText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  sendToRequesterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  sendToRequesterText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  approveQuotationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
  },
  approveQuotationBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  pendingCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pendingName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  pendingSize: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  pendingActions: {
    flexDirection: "row",
    gap: 8,
  },
  pendingCancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  pendingCancelText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  pendingUploadBtn: {
    flex: 2,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
  },
  pendingUploadText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  sapFields: { gap: 10 },
  sapFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sapFieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  sapValue: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 2,
    textAlign: "right",
  },
  sapInput: {
    flex: 2,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  sapBtnRow: { flexDirection: "row", gap: 10 },
  sapSaveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  sapSaveBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  sapCancelBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    borderWidth: 1,
  },
  sapCancelBtnText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  sapEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sapEditBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
});

const sl = StyleSheet.create({
  linkCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  linkHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  linkHint: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  statusChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusChipText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  responseBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  responseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  responseLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  responseDetails: { gap: 4 },
  responseDetail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  linkActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  generateForm: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  hintInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  generateBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  advanceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
  },
  advanceBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  actionBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  bannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  bannerInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    minHeight: 60,
    textAlignVertical: "top",
  },
  bannerBtns: {
    flexDirection: "row",
    gap: 10,
  },
  bannerApproveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerRejectBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    borderWidth: 1.5,
  },
  bannerDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 10,
  },
  bannerBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  responseSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  selectCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  selectLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  viewDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  viewDetailsBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  forwardedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  forwardedBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});

const sqr = StyleSheet.create({
  pricingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  priceCell: {
    flex: 1,
    minWidth: 120,
    gap: 2,
  },
  priceLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
  },
  priceValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  attachBtnText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});

const rd = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  groupTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 6,
  },
  group: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  attachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  attachIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  attachLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  attachName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  attachActions: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  attachActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
