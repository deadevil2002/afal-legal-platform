import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProcurementStageBadge } from "@/components/ProcurementStageBadge";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { ProcurementRequest, useProcurementRequests } from "@/context/ProcurementRequestsContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

// ─── Mini card for recent procurement items ────────────────────────────────────

function HomeProcurementItem({
  item,
  onPress,
}: {
  item: ProcurementRequest;
  onPress: () => void;
}) {
  const colors = useColors();
  const { isRTL } = useT();

  const dateStr = useMemo(() => {
    try {
      const ts = item.createdAt as { toDate?: () => Date };
      const d = ts?.toDate?.() ?? new Date(item.createdAt as string);
      return d.toLocaleDateString(isRTL ? "ar-SA" : "en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }, [item.createdAt, isRTL]);

  return (
    <TouchableOpacity
      style={[
        styles.itemCard,
        {
          backgroundColor: colors.card,
          borderColor: item.isTerminated ? "#FECACA" : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.itemRow, isRTL && styles.itemRowRTL]}>
        <View style={styles.itemMeta}>
          {item.requestNumber ? (
            <Text style={[styles.itemNum, { color: colors.primary }]}>
              {item.requestNumber}
            </Text>
          ) : null}
          <Text
            style={[styles.itemTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {item.groupOrRequesterName ? (
            <Text
              style={[styles.itemSub, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {item.groupOrRequesterName}
            </Text>
          ) : null}
        </View>
        <View style={[styles.itemRight, isRTL && styles.itemRightRTL]}>
          <ProcurementStageBadge stage={item.status} />
          <Text style={[styles.itemDate, { color: colors.mutedForeground }]}>
            {dateStr}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { profile, isAdmin, isSuperAdmin } = useAuth();
  const { procurementRequests, loading, error, refresh } = useProcurementRequests();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);

  const handleRefresh = () => {
    setRefreshing(true);
    refresh();
  };

  const TERMINAL_STATUSES = ["closed", "terminated", "approved"];
  const visible = procurementRequests.filter((r) => !r.isTerminated);
  const recentRequests = visible.slice(0, 5);

  const stats = {
    total: visible.length,
    draft: visible.filter((r) => r.status === "draft").length,
    active: visible.filter(
      (r) => r.status !== "draft" && !TERMINAL_STATUSES.includes(r.status)
    ).length,
    closed: procurementRequests.filter(
      (r) => r.isTerminated || TERMINAL_STATUSES.includes(r.status)
    ).length,
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100),
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* Hero */}
      <View
        style={[
          styles.heroSection,
          {
            backgroundColor: "#FFFFFF",
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
          },
        ]}
      >
        <Logo size="medium" />
        <Text style={[styles.greeting, isRTL && styles.textRTL]}>
          {t("welcomeBack")}, {profile?.displayName?.split(" ")[0] ?? ""}
        </Text>
        <Text style={[styles.subGreeting, isRTL && styles.textRTL]}>
          {t("dashboardSummary")}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: t("statTotal"),    value: stats.total,  color: colors.primary },
          { label: t("stageDraft"),   value: stats.draft,  color: "#D97706" },
          { label: t("statActive"),   value: stats.active, color: colors.secondary },
          { label: t("statResolved"), value: stats.closed, color: "#16A34A" },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Recent Procurement Requests */}
      <View style={styles.section}>
        <View style={[styles.sectionHeader, isRTL && styles.sectionHeaderRTL]}>
          <Text
            style={[styles.sectionTitle, { color: colors.foreground }, isRTL && styles.textRTL]}
          >
            {isAdmin ? t("recentRequests") : t("myRequests")}
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/procurement" as never)}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>{t("allRequests")}</Text>
          </TouchableOpacity>
        </View>

        {loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              {t("loadingProcurement")}
            </Text>
          </View>
        ) : error ? (
          <View style={[styles.errorCard, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}>
            <Icon name="alert-circle" size={20} color="#DC2626" />
            <Text style={[styles.errorText, { color: "#991B1B" }]}>{error}</Text>
          </View>
        ) : recentRequests.length === 0 ? (
          <View
            style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Icon name="archive" size={40} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {t("noProcurementRequests")}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {isSuperAdmin ? t("allRequests") : t("createFirstRFQ")}
            </Text>
          </View>
        ) : (
          recentRequests.map((req) => (
            <HomeProcurementItem
              key={req.id}
              item={req}
              onPress={() => router.push(`/procurement/${req.id}` as never)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroSection: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F8",
  },
  greeting: {
    color: "#1A2B3C",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginTop: 12,
    textAlign: "center",
  },
  subGreeting: {
    color: "#6B7E93",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 2, textAlign: "center" },
  section: { marginTop: 28, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionHeaderRTL: { flexDirection: "row-reverse" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loadingBox: { alignItems: "center", paddingVertical: 48, gap: 14 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  errorCard: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "flex-start",
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 36,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemRowRTL: { flexDirection: "row-reverse" },
  itemMeta: { flex: 1, gap: 2 },
  itemNum: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  itemTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  itemSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  itemRight: { alignItems: "flex-end", gap: 6 },
  itemRightRTL: { alignItems: "flex-start" },
  itemDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  textRTL: { textAlign: "right" },
});
