import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { ProcurementStageBadge } from "@/components/ProcurementStageBadge";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { ProcurementRequest, useProcurementRequests } from "@/context/ProcurementRequestsContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

// ─── Request Card ─────────────────────────────────────────────────────────────

function ProcurementCard({
  item,
  onPress,
  onDelete,
}: {
  item: ProcurementRequest;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const colors = useColors();
  const { isRTL } = useT();

  const dateStr = useMemo(() => {
    try {
      const ts = item.createdAt as { toDate?: () => Date };
      const d = ts?.toDate?.() ?? new Date(item.createdAt as string);
      return d.toLocaleDateString(isRTL ? "ar-SA" : "en-US", {
        year: "numeric",
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
        styles.card,
        { backgroundColor: colors.card, borderColor: item.isTerminated ? "#FECACA" : colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardMeta}>
          {item.requestNumber ? (
            <Text style={[styles.requestNum, { color: colors.primary }]}>
              {item.requestNumber}
            </Text>
          ) : null}
          <Text
            style={[styles.cardTitle, { color: colors.foreground }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.groupOrRequesterName}
          </Text>
        </View>
        <View style={styles.cardActions}>
          {!!onDelete && !item.isTerminated && (
            <TouchableOpacity
              onPress={onDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.trashBtn}
            >
              <Icon name="trash" size={16} color="#EF4444" />
            </TouchableOpacity>
          )}
          <Icon name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>
      </View>
      <View style={styles.cardBottom}>
        <ProcurementStageBadge stage={item.status} />
        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>{dateStr}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProcurementScreen() {
  const colors = useColors();
  const { t, language, isRTL } = useT();
  const { profile, isAdmin, isSuperAdmin } = useAuth();
  const { procurementRequests, loading, error, refresh, deleteRequest } = useProcurementRequests();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showTerminated, setShowTerminated] = useState(false);

  const canCreate = profile?.canSubmitRequests === true || isAdmin;

  const filtered = useMemo(() => {
    let results = procurementRequests;
    // Hide terminated requests by default; Super Admin can toggle to reveal them.
    if (!showTerminated) {
      results = results.filter((r) => !r.isTerminated);
    }
    if (!search.trim()) return results;
    const q = search.toLowerCase();
    return results.filter(
      (r) =>
        r.title?.toLowerCase().includes(q) ||
        r.groupOrRequesterName?.toLowerCase().includes(q) ||
        r.requestNumber?.toLowerCase().includes(q)
    );
  }, [procurementRequests, search, showTerminated]);

  const handleDelete = (item: ProcurementRequest) => {
    Alert.alert(
      language === "ar" ? "إنهاء هذا الطلب؟" : "Terminate This Request?",
      language === "ar"
        ? "سيتم تحديد الطلب كمنهي وإخفاؤه من القائمة الرئيسية. يمكنك الاطلاع عليه لاحقاً عبر خيار عرض المنهية."
        : "The request will be marked as terminated and hidden from the main list. You can view it later via Show Terminated.",
      [
        { text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: language === "ar" ? "إنهاء" : "Terminate",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRequest(item.id);
            } catch (err) {
              Alert.alert(
                language === "ar" ? "خطأ" : "Error",
                language === "ar" ? "تعذّر إنهاء الطلب." : "Failed to terminate request."
              );
            }
          },
        },
      ]
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

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
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t("procurementRequests")}</Text>
          <View style={styles.headerBtns}>
            {isSuperAdmin && (
              <TouchableOpacity
                style={[styles.iconBtn, showTerminated && { backgroundColor: "rgba(239,68,68,0.25)" }]}
                onPress={() => setShowTerminated((v) => !v)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Icon name="trash" size={17} color={showTerminated ? "#EF4444" : "rgba(255,255,255,0.7)"} />
              </TouchableOpacity>
            )}
            {canCreate && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => router.push("/procurement/new" as never)}
              >
                <Icon name="plus" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
          <Icon name="search" size={16} color="rgba(255,255,255,0.8)" />
          <TextInput
            style={[styles.searchInput, { textAlign: isRTL ? "right" : "left" }]}
            placeholder={t("search")}
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Icon name="close" size={16} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body */}
      {loading && procurementRequests.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t("loadingProcurement")}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Icon name="alert-circle" size={40} color={colors.destructive} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{error}</Text>
          <TouchableOpacity onPress={refresh} style={[styles.retryBtn, { borderColor: colors.primary }]}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
              {t("ok")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            filtered.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="archive" size={52} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {search ? t("noMatchingRequests") : t("noProcurementRequests")}
              </Text>
              {!search && canCreate && (
                <TouchableOpacity
                  style={[styles.createBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push("/procurement/new" as never)}
                >
                  <Text style={styles.createBtnText}>{t("newRFQ")}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filtered.map((item) => (
              <ProcurementCard
                key={item.id}
                item={item}
                onPress={() => router.push(`/procurement/${item.id}` as never)}
                onDelete={isSuperAdmin ? () => handleDelete(item) : undefined}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    flex: 1,
  },
  headerBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    padding: 0,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  list: { padding: 16, gap: 12 },
  listEmpty: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  createBtn: {
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 4,
  },
  createBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trashBtn: {
    padding: 4,
  },
  cardMeta: { flex: 1, gap: 3 },
  requestNum: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  cardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
