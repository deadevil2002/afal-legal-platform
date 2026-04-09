import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { RequestCard } from "@/components/RequestCard";
import { UserProfileModal } from "@/components/UserProfileModal";
import { useAuth } from "@/context/AuthContext";
import { useRequests } from "@/context/RequestsContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

const STATUS_FILTER_ITEMS = [
  { value: "All",              labelKey: "all" },
  { value: "Submitted",       labelKey: "statusSubmitted" },
  { value: "Under Review",    labelKey: "statusUnderReview" },
  { value: "In Progress",     labelKey: "statusInProgress" },
  { value: "Resolved / Closed", labelKey: "statusResolvedClosed" },
  { value: "Escalated",       labelKey: "statusEscalated" },
] as const;

type FilterValue = (typeof STATUS_FILTER_ITEMS)[number]["value"];

export default function RequestsScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { user, isAdmin } = useAuth();
  const { requests, loading, error, refresh } = useRequests();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("All");
  const [search, setSearch] = useState("");
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);

  const handleRefresh = () => {
    setRefreshing(true);
    refresh();
  };

  const filtered = requests.filter((r) => {
    const matchFilter = filter === "All" || r.status === filter;
    const matchSearch =
      !search ||
      r.title?.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase()) ||
      r.category?.toLowerCase().includes(search.toLowerCase()) ||
      r.type?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.primary,
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <Text style={[styles.headerTitle, isRTL && styles.textRTL]}>
          {isAdmin ? t("allRequests") : t("myRequests")}
        </Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push("/request/new" as never)}
        >
          <Icon name="plus" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Icon name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          value={search}
          onChangeText={setSearch}
          placeholder={t("search")}
          placeholderTextColor={colors.mutedForeground}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Icon name="close" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 48 }}
        contentContainerStyle={styles.filterRow}
      >
        {STATUS_FILTER_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === item.value ? colors.primary : colors.card,
                borderColor: filter === item.value ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setFilter(item.value)}
          >
            <Text style={[styles.filterText, { color: filter === item.value ? "#fff" : colors.foreground }]}>
              {t(item.labelKey as Parameters<typeof t>[0])}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
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
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="archive" size={44} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {filter !== "All" ? t("noMatchingRequests") : t("noRequests")}
            </Text>
            {filter !== "All" ? (
              <TouchableOpacity onPress={() => setFilter("All")}>
                <Text style={[styles.clearFilter, { color: colors.primary }]}>{t("clearFilter")}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/request/new" as never)}
              >
                <Icon name="plus" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>{t("newRequest")}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filtered.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              showUser={isAdmin}
              currentUserId={user?.uid}
              onSenderPress={isAdmin ? (uid) => setProfileModalUserId(uid) : undefined}
            />
          ))
        )}
      </ScrollView>
      <UserProfileModal userId={profileModalUserId} onClose={() => setProfileModalUserId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    justifyContent: "space-between",
  },
  headerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  addBtn: { padding: 4 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  filterText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  list: { flex: 1 },
  listContent: { padding: 16 },
  loadingBox: { alignItems: "center", marginTop: 60, gap: 12 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  errorCard: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "flex-start",
    marginTop: 16,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  emptyState: { alignItems: "center", justifyContent: "center", marginTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  clearFilter: { fontSize: 13, fontFamily: "Inter_500Medium" },
  textRTL: { textAlign: "right" },
});
