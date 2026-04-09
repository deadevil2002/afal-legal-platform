import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { TranslationKey } from "@/i18n/translations";
import { StatusBadge } from "./StatusBadge";

// Handles both title-case (new records) and snake_case / typo variants (legacy Firestore records)
export const CATEGORY_KEY_MAP: Record<string, TranslationKey> = {
  // ── Title-case (canonical) ─────────────────────────────────────────────
  "Amicable Settlement":   "typeAmicable",
  "Complaint":             "typeComplaint",
  "Legal Consultation":    "typeLegalConsultation",
  "Investigation Request": "typeInvestigation",
  "Contract Issue":        "typeContractIssue",
  "Violation Report":      "typeViolationReport",
  // ── snake_case variants ────────────────────────────────────────────────
  "amicable_settlement":   "typeAmicable",
  "amicaable_settlement":  "typeAmicable",   // legacy typo
  "complaint":             "typeComplaint",
  "legal_consultation":    "typeLegalConsultation",
  "investigation_request": "typeInvestigation",
  "contract_issue":        "typeContractIssue",
  "violation_report":      "typeViolationReport",
};

export interface Request {
  id: string;
  title: string;
  description: string;
  type: string;
  category?: string;
  status: string;
  priority: "low" | "medium" | "high" | "urgent";
  userId?: string;
  createdBy?: string;
  createdByName?: string;
  createdByAdmin?: boolean;
  targetEmployeeName?: string;
  targetEmployeeNumber?: string;
  createdAt: unknown;
  updatedAt?: unknown;
  messageCount?: number;
  attachments?: Array<{
    fileUrl?: string;
    url?: string;
    publicId?: string;
    storagePath?: string;
    fileName: string;
    fileType?: string;
    mimeType?: string;
    size: number;
    resourceType?: string;
    folder?: string;
  }>;
  viewedByAdmin?: boolean;
}

interface RequestCardProps {
  request: Request;
  showUser?: boolean;
  isAdmin?: boolean;
}

export function RequestCard({ request, showUser = false, isAdmin = false }: RequestCardProps) {
  const colors = useColors();
  const router = useRouter();
  const { t, isRTL } = useT();

  const showNewDot = isAdmin && !request.viewedByAdmin;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!showNewDot) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showNewDot, pulseAnim]);

  const formatDate = (ts: unknown): string => {
    if (!ts) return "";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const rawCategory = request.category || request.type || "";
  const displayCategory = rawCategory
    ? (CATEGORY_KEY_MAP[rawCategory] ? t(CATEGORY_KEY_MAP[rawCategory]) : rawCategory)
    : "";

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: showNewDot ? "#22C55E" : colors.border },
      ]}
      onPress={() => router.push(`/request/${request.id}` as never)}
      activeOpacity={0.85}
    >
      {showNewDot && (
        <Animated.View
          style={[
            styles.newDotOuter,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <View style={styles.newDotInner} />
        </Animated.View>
      )}
      <View style={[styles.header, isRTL && styles.headerRTL]}>
        <View style={styles.badges}>
          <StatusBadge status={request.status} />
          <StatusBadge priority={request.priority} />
        </View>
        <Icon name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>

      <Text
        style={[styles.title, { color: colors.foreground }, isRTL && styles.textRTL]}
        numberOfLines={2}
      >
        {request.title}
      </Text>

      {!!displayCategory && (
        <View style={[styles.categoryTag, { backgroundColor: colors.primary + "12" }]}>
          <Text style={[styles.categoryText, { color: colors.primary }]} numberOfLines={1}>
            {displayCategory}
          </Text>
        </View>
      )}

      <Text
        style={[styles.description, { color: colors.mutedForeground }, isRTL && styles.textRTL]}
        numberOfLines={2}
      >
        {request.description}
      </Text>

      {request.createdByAdmin && (
        <View style={[styles.adminBadge, { backgroundColor: "#BC9B5D" + "20" }]}>
          <Icon name="shield-check" size={10} color="#BC9B5D" />
          <Text style={[styles.adminBadgeText, { color: "#BC9B5D" }]}>
            {t("sentByAdmin")}{request.targetEmployeeName ? ` → ${request.targetEmployeeName}` : ""}
          </Text>
        </View>
      )}
      <View style={[styles.footer, { borderTopColor: colors.border }, isRTL && styles.footerRTL]}>
        {showUser && request.createdByName && (
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {request.createdByName}
          </Text>
        )}
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {formatDate(request.createdAt)}
        </Text>
        <View style={styles.footerRight}>
          {!!request.attachments?.length && (
            <View style={styles.messageCount}>
              <Icon name="paperclip" size={12} color={colors.mutedForeground} />
              <Text style={[styles.messageCountText, { color: colors.mutedForeground }]}>
                {request.attachments.length}
              </Text>
            </View>
          )}
          {!!request.messageCount && request.messageCount > 0 && (
            <View style={styles.messageCount}>
              <Icon name="chat-bubble" size={12} color={colors.secondary} />
              <Text style={[styles.messageCountText, { color: colors.secondary }]}>
                {request.messageCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headerRTL: { flexDirection: "row-reverse" },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1 },
  title: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    lineHeight: 24,
  },
  categoryTag: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  categoryText: { fontSize: 11, fontFamily: "Inter_500Medium", lineHeight: 18 },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 12,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  adminBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 10,
  },
  footerRTL: { flexDirection: "row-reverse" },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  textRTL: { textAlign: "right" },
  messageCount: { flexDirection: "row", alignItems: "center", gap: 3 },
  messageCountText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  newDotOuter: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(34,197,94,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  newDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
});
