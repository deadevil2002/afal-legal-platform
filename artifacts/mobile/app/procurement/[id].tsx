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
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiGet, apiPost } from "@/lib/apiClient";
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredAttachment {
  name: string;
  url: string;
  type: string;
  size?: number;
  uploadedAt?: string;
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
  contactPersonName?: string;
  phone?: string;
  email?: string;
  priceExcludingVatSar?: number;
  vatAmountSar?: number;
  priceIncludingVatSar?: number;
  paymentTerms?: "advance" | "50_50" | "after_supply";
  notes?: string | null;
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

function fileColorForType(mimeType: string): string {
  if (mimeType.includes("pdf")) return "#DC2626";
  if (mimeType.includes("sheet") || mimeType.includes("xlsx") || mimeType.includes("csv")) return "#16A34A";
  if (mimeType.includes("word") || mimeType.includes("document")) return "#2563EB";
  if (mimeType.startsWith("image/")) return "#0891B2";
  return "#6B7280";
}

function fileIconForType(mimeType: string): "file-doc" | "image" | "paperclip" {
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
  const label = quotation.customLabel ?? `${t("quotationLabel" as never)} ${index + 1}`;

  return (
    <View style={[sub.quotationCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[sub.qcIconWrap, { backgroundColor: fileColor + "18" }]}>
        <Icon name={fileIcon} size={22} color={fileColor} />
      </View>
      <Text style={[sub.qcLabel, { color: colors.foreground }]} numberOfLines={2}>
        {label}
      </Text>
      {quotation.size ? (
        <Text style={[sub.qcMeta, { color: colors.mutedForeground }]}>
          {formatFileSize(quotation.size)}
        </Text>
      ) : null}
      {quotation.uploadedAt ? (
        <Text style={[sub.qcMeta, { color: colors.mutedForeground }]}>
          {formatDateShort(quotation.uploadedAt, isRTL)}
        </Text>
      ) : null}
      <AttachmentViewer
        attachment={{ fileName: label, url: quotation.url, fileType: quotation.type, size: quotation.size }}
        style={sub.qcViewBtn}
        iconColor={colors.secondary}
        textColor={colors.secondary}
      />
      <View style={sub.qcCircle} />
    </View>
  );
}

function SelectableQuotationCard({
  quotation,
  index,
  selected,
  onSelect,
  colors,
  t,
  isRTL,
}: {
  quotation: QuotationAttachment;
  index: number;
  selected: boolean;
  onSelect: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const fileColor = fileColorForType(quotation.type);
  const fileIcon = fileIconForType(quotation.type);
  const label = quotation.customLabel ?? `${t("quotationLabel" as never)} ${index + 1}`;

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
      <View style={[sub.qcIconWrap, { backgroundColor: fileColor + "18" }]}>
        <Icon name={fileIcon} size={22} color={fileColor} />
      </View>
      <Text style={[sub.qcLabel, { color: colors.foreground }]} numberOfLines={2}>
        {label}
      </Text>
      {quotation.size ? (
        <Text style={[sub.qcMeta, { color: colors.mutedForeground }]}>
          {formatFileSize(quotation.size)}
        </Text>
      ) : null}
      <AttachmentViewer
        attachment={{ fileName: label, url: quotation.url, fileType: quotation.type }}
        style={sub.qcViewBtn}
        iconColor={colors.secondary}
        textColor={colors.secondary}
      />
      <View
        style={[
          sub.qcCircle,
          selected && { backgroundColor: colors.primary, borderColor: colors.primary },
        ]}
      >
        {selected && <Icon name="check" size={12} color="#fff" />}
      </View>
    </TouchableOpacity>
  );
}

function ApprovedCard({
  quotation,
  colors,
  t,
  isRTL,
}: {
  quotation: QuotationAttachment;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (k: never) => string;
  isRTL: boolean;
}) {
  const fileColor = fileColorForType(quotation.type);
  const fileIcon = fileIconForType(quotation.type);
  const label = quotation.customLabel ?? quotation.name;

  return (
    <View style={[sub.approvedCard, { borderColor: "#16A34A30", backgroundColor: "#F0FDF4" }]}>
      <View style={[sub.approvedIconWrap, { backgroundColor: "#16A34A" }]}>
        <Icon name="check" size={16} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={sub.approvedRow}>
          <Icon name={fileIcon} size={15} color={fileColor} />
          <Text style={[sub.approvedName, { color: "#166534" }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Text style={[sub.approvedMeta, { color: "#16A34A" }]}>
          {t("approvedAttachmentDesc" as never)}
        </Text>
      </View>
      <AttachmentViewer
        attachment={{ fileName: label, url: quotation.url, fileType: quotation.type }}
        style={sub.approvedViewBtn}
        iconColor="#16A34A"
        textColor="#16A34A"
      />
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
          {event.eventType.replace(/_/g, " ")}
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

// ─── Supplier Link sub-components ────────────────────────────────────────────

function SupplierLinkCard({
  link,
  onShare,
  onDeactivate,
  canDeactivate,
  colors,
  t,
  isRTL,
}: {
  link: SupplierLink;
  onShare: (url: string, hint: string | null) => void;
  onDeactivate: (id: string) => void;
  canDeactivate: boolean;
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
                {t("priceExclVatLabel" as never)}: SAR {resp.priceExcludingVatSar.toLocaleString()}
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
      Alert.alert(
        action.endsWith("_approve") ? t("workflowApproved" as never) : t("workflowRejected" as never),
        ""
      );
      setComment("");
    } catch (err) {
      Alert.alert(t("error" as never), (err as Error).message);
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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProcurementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t, isRTL, language } = useT();
  const { profile, user, isAdmin, isSuperAdmin } = useAuth();
  const { deleteRequest } = useProcurementRequests();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [request, setRequest] = useState<ProcurementRequest | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [loadingRequest, setLoadingRequest] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [uploadingQuotation, setUploadingQuotation] = useState(false);
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
  const canSelectQuotation =
    (isCreator && !request?.selectedQuotationAttachmentId) || isSuperAdmin;
  const canManageSAP = isProcurementRole;

  const canView =
    isAdmin || isCreator;

  const dateCreated = useMemo(
    () => (request ? formatTs(request.createdAt, isRTL) : ""),
    [request, isRTL]
  );

  const quotations = (request?.quotationAttachments ?? []) as QuotationAttachment[];
  const requesterAtts = (request?.attachments ?? []) as StoredAttachment[];

  // ── Supplier links fetch ────────────────────────────────────────────────────

  useEffect(() => {
    if (!id || (!isProcurementRole && !isCreator)) return;
    let cancelled = false;
    setLoadingLinks(true);
    apiGet<{ links: SupplierLink[] }>(`/api/procurement/supplier-links/${id}`)
      .then(({ links }) => { if (!cancelled) setSupplierLinks(links); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingLinks(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, linksRefreshKey, isProcurementRole, isCreator]);

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
    } catch {
      Alert.alert(t("error"), t("errUpload"));
    } finally {
      setUploadingQuotation(false);
    }
  };

  const handleAddQuotation = () => {
    if (!canUploadQuotations) return;
    Alert.alert(t("addQuotation"), "", [
      { text: t("imageFromGallery"), onPress: pickImageForQuotation },
      { text: t("documentPdfWord"), onPress: pickDocumentForQuotation },
      { text: t("cancel"), style: "cancel" },
    ]);
  };

  const pickImageForQuotation = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t("error"), t("permissionDenied"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      await uploadQuotation(
        asset.uri,
        asset.fileName || `quotation_${Date.now()}.jpg`,
        asset.mimeType || "image/jpeg"
      );
    } catch {
      Alert.alert(t("error"), t("errGeneric"));
    } finally {
      pickingRef.current = false;
    }
  };

  const pickDocumentForQuotation = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      await uploadQuotation(asset.uri, asset.name, asset.mimeType || "application/octet-stream");
    } catch {
      Alert.alert(t("error"), t("errGeneric"));
    } finally {
      pickingRef.current = false;
    }
  };

  // ── Quotation selection ─────────────────────────────────────────────────────

  const handleSelectQuotation = async (quotation: QuotationAttachment) => {
    if (!id || !user || !profile) return;
    try {
      await updateDoc(doc(db, "procurement_requests", id), {
        selectedQuotationAttachmentId: quotation.id,
        approvedAttachment: quotation,
        updatedAt: serverTimestamp(),
      });
      try {
        await addDoc(collection(db, "workflow_events"), {
          requestId: id,
          requestCreatorUid: user.uid,
          actorUid: user.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          eventType: "quotation_selected",
          fromStage: null,
          toStage: "quotation_selected",
          comment: `Selected: ${quotation.customLabel ?? quotation.name}`,
          attachments: [],
          createdAt: serverTimestamp(),
          metadata: null,
        });
      } catch {
        // non-critical
      }
      Alert.alert(t("success"), t("quotationSelectedSuccess"));
    } catch {
      Alert.alert(t("error"), t("errGeneric"));
    }
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
      Alert.alert(t("success"), t("sapInfoSaved"));
    } catch {
      Alert.alert(t("error"), t("errGeneric"));
    } finally {
      setSavingSap(false);
    }
  };

  // ── Supplier link actions ───────────────────────────────────────────────────

  const handleGenerateLink = async () => {
    if (!id) return;
    setGeneratingLink(true);
    try {
      await apiPost("/api/procurement/supplier-links", {
        requestId: id,
        supplierNameHint: linkHint.trim() || null,
      });
      setLinkHint("");
      refreshLinks();
      Alert.alert(t("success"), t("linkGeneratedSuccess"));
    } catch (err) {
      Alert.alert(t("error"), (err as Error).message);
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleShareLink = async (url: string, hint: string | null) => {
    try {
      await Share.share({ message: url, title: hint ?? undefined });
    } catch {
      Alert.alert(t("success"), url);
    }
  };

  const handleDeactivateLink = (linkId: string) => {
    Alert.alert(t("deactivateLink"), "", [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("deactivateLink"),
        style: "destructive",
        onPress: async () => {
          try {
            await apiPost(`/api/procurement/supplier-links/${linkId}/deactivate`, {});
            refreshLinks();
          } catch (err) {
            Alert.alert(t("error"), (err as Error).message);
          }
        },
      },
    ]);
  };

  const handleAdvanceToBudget = () => {
    Alert.alert(t("sendToBudgetWorkflow"), t("sendToBudgetWorkflowConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("submitApproval"),
        onPress: async () => {
          try {
            await apiPost(`/api/procurement/workflow/${id}/advance`, {
              action: "procurement_advance",
              comment: null,
            });
          } catch (err) {
            Alert.alert(t("error"), (err as Error).message);
          }
        },
      },
    ]);
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
              Alert.alert(
                language === "ar" ? "إنهاء هذا الطلب؟" : "Terminate This Request?",
                language === "ar"
                  ? "سيتم تحديد الطلب كمنهي."
                  : "The request will be marked as terminated.",
                [
                  { text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
                  {
                    text: language === "ar" ? "إنهاء" : "Terminate",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await deleteRequest(id!);
                        router.back();
                      } catch {
                        Alert.alert(
                          language === "ar" ? "خطأ" : "Error",
                          language === "ar" ? "تعذّر إنهاء الطلب." : "Failed to terminate."
                        );
                      }
                    },
                  },
                ]
              )
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={[sc.quotationsRow, isRTL && { flexDirection: "row-reverse" }]}>
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
              </ScrollView>
            )}

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
          </SectionCard>
        )}

        {/* ── Section C: Requester Quotation Selection ────────────────────── */}
        {quotations.length > 0 && (isCreator || isSuperAdmin) && (
          <SectionCard icon="check-circle" label={t("selectQuotationPrompt")} colors={colors}>
            <Text style={[sc.sectionDesc, { color: colors.mutedForeground }]}>
              {canSelectQuotation
                ? t("quotationSectionDesc")
                : t("quotationSelectedLabel")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={[sc.quotationsRow, isRTL && { flexDirection: "row-reverse" }]}>
                {quotations.map((q, i) => (
                  <SelectableQuotationCard
                    key={q.id}
                    quotation={q}
                    index={i}
                    selected={request.selectedQuotationAttachmentId === q.id}
                    onSelect={() => {
                      if (!canSelectQuotation) return;
                      Alert.alert(
                        t("selectThis"),
                        q.customLabel ?? q.name,
                        [
                          { text: t("cancel"), style: "cancel" },
                          { text: t("selectThis"), onPress: () => handleSelectQuotation(q) },
                        ]
                      );
                    }}
                    colors={colors}
                    t={t as never}
                    isRTL={isRTL}
                  />
                ))}
              </View>
            </ScrollView>
          </SectionCard>
        )}

        {/* ── Section D: Approved Attachment ─────────────────────────────── */}
        {request.approvedAttachment && (
          <SectionCard icon="check-circle" label={t("approvedAttachmentSection")} colors={colors}>
            <ApprovedCard
              quotation={request.approvedAttachment as QuotationAttachment}
              colors={colors}
              t={t as never}
              isRTL={isRTL}
            />
          </SectionCard>
        )}

        {/* ── Section E: Supplier Links ────────────────────────────────────── */}
        {request.approvedAttachment &&
          (isProcurementRole || (isCreator && supplierLinks.some((l) => !!l.response))) && (
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
                  colors={colors}
                  t={t as never}
                  isRTL={isRTL}
                />
              ))
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
    width: 130,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 8,
    marginRight: 10,
  },
  qcIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  qcLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 17,
  },
  qcMeta: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  qcViewBtn: {
    paddingVertical: 2,
  },
  qcCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
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
  bannerBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
