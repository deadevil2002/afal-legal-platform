import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { RequestCard } from "@/components/RequestCard";
import { useAuth } from "@/context/AuthContext";
import { useRequests } from "@/context/RequestsContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export default function HomeScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { profile, isAdmin, isSuperAdmin } = useAuth();
  const { requests, loading, error, refresh } = useRequests();
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

  const recentRequests = requests.slice(0, 5);

  const stats = {
    total: requests.length,
    submitted: requests.filter((r) => r.status === "Submitted").length,
    active: requests.filter((r) => r.status !== "Resolved / Closed").length,
    closed: requests.filter((r) => r.status === "Resolved / Closed").length,
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
            backgroundColor: colors.primary,
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
          { label: t("statTotal"),     value: stats.total,     color: colors.primary },
          { label: t("statSubmitted"), value: stats.submitted,  color: "#D97706" },
          { label: t("statActive"),    value: stats.active,     color: colors.secondary },
          { label: t("statResolved"),  value: stats.closed,     color: "#16A34A" },
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

      {/* Recent Requests */}
      <View style={styles.section}>
        <View style={[styles.sectionHeader, isRTL && styles.sectionHeaderRTL]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }, isRTL && styles.textRTL]}>
            {isAdmin ? t("recentRequests") : t("myRequests")}
          </Text>
          <View style={[styles.sectionActions, isRTL && styles.sectionActionsRTL]}>
            {!isSuperAdmin && (
              <TouchableOpacity
                style={[styles.newBtn, { backgroundColor: colors.accent }]}
                onPress={() => router.push("/request/new" as never)}
                activeOpacity={0.85}
              >
                <Icon name="plus" size={13} color="#fff" />
                <Text style={styles.newBtnText}>{t("newRequest")}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.push("/(tabs)/requests" as never)}>
              <Text style={[styles.seeAll, { color: colors.primary }]}>{t("allRequests")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              {t("loadingRequests")}
            </Text>
          </View>
        ) : error ? (
          <View style={[styles.errorCard, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}>
            <Icon name="alert-circle" size={20} color="#DC2626" />
            <Text style={[styles.errorText, { color: "#991B1B" }]}>{error}</Text>
          </View>
        ) : recentRequests.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Icon name="archive" size={40} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noRequests")}</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {t("createFirstRequest")}
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/request/new" as never)}
            >
              <Icon name="plus" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>{t("newRequest")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          recentRequests.map((req) => (
            <RequestCard key={req.id} request={req} showUser={isAdmin} />
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
    paddingBottom: 32,
    alignItems: "center",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  greeting: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginTop: 16,
    textAlign: "center",
  },
  subGreeting: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: -20,
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
  sectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionActionsRTL: { flexDirection: "row-reverse" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  newBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
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
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  textRTL: { textAlign: "right" },
});
