import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type DeletionStatus = "pending" | "approved" | "rejected" | "closed";

interface DeletionRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  status: DeletionStatus;
  reason?: string;
  createdAt: { toDate?: () => Date } | null;
  reviewedAt?: { toDate?: () => Date } | null;
  reviewedBy?: string;
}

const STATUS_COLOR: Record<DeletionStatus, string> = {
  pending: "#D97706",
  approved: "#16A34A",
  rejected: "#DC2626",
  closed: "#6B7280",
};

export default function DeletionRequestsScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { isSuperAdmin, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const q = query(collection(db, "deletion_requests"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeletionRequest)));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="lock" size={48} color={colors.border} />
        <Text style={[styles.denied, { color: colors.foreground }]}>Access Denied</Text>
      </View>
    );
  }

  const formatDate = (ts: { toDate?: () => Date } | null | undefined): string => {
    if (!ts?.toDate) return "—";
    return ts.toDate().toLocaleDateString(isRTL ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const updateStatus = async (id: string, status: DeletionStatus) => {
    setActionId(id);
    try {
      await updateDoc(doc(db, "deletion_requests", id), {
        status,
        reviewedAt: serverTimestamp(),
        reviewedBy: profile?.uid ?? null,
      });
    } catch (e: unknown) {
      Alert.alert(t("error"), t("errGeneric"));
    } finally {
      setActionId(null);
    }
  };

  const confirmAction = (id: string, status: DeletionStatus) => {
    const messageKey =
      status === "approved"
        ? "confirmApproveDelete"
        : status === "rejected"
        ? "confirmRejectDelete"
        : "confirmCloseDelete";
    Alert.alert(
      t(status === "approved" ? "approve" : status === "rejected" ? "reject" : "close"),
      t(messageKey),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("confirm"),
          style: status === "approved" ? "destructive" : "default",
          onPress: () => updateStatus(id, status),
        },
      ]
    );
  };

  const statusLabel = (s: DeletionStatus): string =>
    ({
      pending: t("statusPending"),
      approved: t("deletionStatusApproved"),
      rejected: t("deletionStatusRejected"),
      closed: t("close"),
    }[s] ?? s);

  const pending = requests.filter((r) => r.status === "pending");
  const others = requests.filter((r) => r.status !== "pending");

  const renderCard = (req: DeletionRequest) => (
    <View
      key={req.id}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.userInfo}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
            <Icon name="person" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
              {req.userName || t("noData")}
            </Text>
            <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
              {req.userEmail}
            </Text>
          </View>
        </View>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[req.status] + "20" }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[req.status] }]}>
            {statusLabel(req.status)}
          </Text>
        </View>
      </View>

      {req.reason ? (
        <View style={[styles.reasonBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.reasonLabel, { color: colors.mutedForeground }]}>{t("reason")}</Text>
          <Text style={[styles.reasonText, { color: colors.foreground }]}>{req.reason}</Text>
        </View>
      ) : (
        <Text style={[styles.noReason, { color: colors.mutedForeground }]}>{t("noReason")}</Text>
      )}

      <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
        {t("requestedAt")}: {formatDate(req.createdAt)}
      </Text>

      {req.status === "pending" && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#16A34A" }, actionId === req.id && { opacity: 0.5 }]}
            onPress={() => confirmAction(req.id, "approved")}
            disabled={actionId !== null}
          >
            {actionId === req.id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="check-circle" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>{t("approve")}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#DC2626" }, actionId === req.id && { opacity: 0.5 }]}
            onPress={() => confirmAction(req.id, "rejected")}
            disabled={actionId !== null}
          >
            {actionId === req.id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="x-circle" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>{t("reject")}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#6B7280" }, actionId === req.id && { opacity: 0.5 }]}
            onPress={() => confirmAction(req.id, "closed")}
            disabled={actionId !== null}
          >
            {actionId === req.id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="x-circle" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>{t("close")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: "#0C233C",
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, isRTL && { textAlign: "right" }]}>
            {t("deletionRequests")}
          </Text>
          {requests.length > 0 && (
            <Text style={[styles.headerSub, isRTL && { textAlign: "right" }]}>
              {pending.length} {t("statusPending").toLowerCase()}
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <Icon name="trash" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t("noDeletionRequests")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 40 },
          ]}
        >
          {pending.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
                {t("statusPending")} ({pending.length})
              </Text>
              {pending.map(renderCard)}
            </>
          )}
          {others.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: pending.length > 0 ? 16 : 0 }]}>
                {t("deletionReviewed")} ({others.length})
              </Text>
              {others.map(renderCard)}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  denied: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { color: "#fff9", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  scroll: { padding: 16, gap: 12 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, marginBottom: 4, paddingHorizontal: 2 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  userInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  reasonBox: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 3 },
  reasonLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
  reasonText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  noReason: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  dateText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 8, marginTop: 2 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 8,
    paddingVertical: 9,
  },
  actionBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
