import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import type { ProfileChangeRequest } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type ChangeStatus = "pending" | "approved" | "rejected" | "cancelled";

const STATUS_COLOR: Record<ChangeStatus, string> = {
  pending: "#D97706",
  approved: "#16A34A",
  rejected: "#DC2626",
  cancelled: "#6B7280",
};

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  try {
    const d = (ts as { toDate?: () => Date }).toDate?.();
    if (!d) return "—";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function ProfileChangesScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { isSuperAdmin, approveProfileChange, rejectProfileChange } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [requests, setRequests] = useState<ProfileChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const [rejectModal, setRejectModal] = useState<{
    visible: boolean;
    requestId: string;
    reason: string;
    submitting: boolean;
  }>({ visible: false, requestId: "", reason: "", submitting: false });

  useEffect(() => {
    if (!isSuperAdmin) return;
    const q = query(
      collection(db, "profile_change_requests"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setRequests(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProfileChangeRequest, "id">) }))
      );
      setLoading(false);
    });
    return unsub;
  }, [isSuperAdmin]);

  const handleApprove = async (req: ProfileChangeRequest) => {
    setActionId(req.id);
    try {
      await approveProfileChange(req.id, req);
      Alert.alert(t("success"), t("approvalSuccess"));
    } catch (e: unknown) {
      const msg = (e as Error)?.message;
      if (msg === "already_taken") {
        Alert.alert(t("error"), t("alreadyTaken"));
      } else {
        Alert.alert(t("error"), msg);
      }
    } finally {
      setActionId(null);
    }
  };

  const openRejectModal = (id: string) => {
    setRejectModal({ visible: true, requestId: id, reason: "", submitting: false });
  };

  const handleReject = async () => {
    const { requestId, reason } = rejectModal;
    if (!reason.trim()) {
      Alert.alert(t("error"), t("reasonRequired"));
      return;
    }
    setRejectModal((prev) => ({ ...prev, submitting: true }));
    try {
      await rejectProfileChange(requestId, reason.trim());
      setRejectModal({ visible: false, requestId: "", reason: "", submitting: false });
      Alert.alert(t("success"), t("rejectionSuccess"));
    } catch (e: unknown) {
      setRejectModal((prev) => ({ ...prev, submitting: false }));
      Alert.alert(t("error"), (e as Error)?.message);
    }
  };

  if (!isSuperAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Icon name="chevron-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("profileChangesTitle")}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.centered}>
          <Icon name="shield-check" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("accessDenied")}</Text>
        </View>
      </View>
    );
  }

  const fieldLabel = (field: string) =>
    field === "phone" ? t("phoneField") : t("employeeNumberField");

  const statusLabel = (status: ChangeStatus) => {
    switch (status) {
      case "pending": return t("pendingStatus");
      case "approved": return t("approvedStatus");
      case "rejected": return t("rejectedStatus");
      case "cancelled": return t("cancelledStatus");
      default: return status;
    }
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, isRTL && { textAlign: "right" }]}>
            {t("profileChangesTitle")}
          </Text>
          <Text style={[styles.headerSub, isRTL && { textAlign: "right" }]}>
            {t("profileChangesSubtitle")}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.centered}>
          <Icon name="document-text" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t("noProfileChangeRequests")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {requests.map((req) => {
            const isPending = req.status === "pending";
            const statusColor = STATUS_COLOR[req.status as ChangeStatus] ?? "#6B7280";
            const isActioning = actionId === req.id;

            return (
              <View
                key={req.id}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                {/* Status badge + field pill */}
                <View style={styles.cardTopRow}>
                  <View style={[styles.fieldPill, { backgroundColor: colors.primary + "18" }]}>
                    <Icon
                      name={req.field === "phone" ? "phone" : "tag"}
                      size={12}
                      color={colors.primary}
                    />
                    <Text style={[styles.fieldPillText, { color: colors.primary }]}>
                      {fieldLabel(req.field)}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: statusColor + "18" }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {statusLabel(req.status as ChangeStatus)}
                    </Text>
                  </View>
                </View>

                {/* User info */}
                <View style={styles.userRow}>
                  <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarLetter}>
                      {(req.userName || req.userEmail || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userName, { color: colors.foreground }]}>
                      {req.userName || "—"}
                    </Text>
                    <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>
                      {req.userEmail || "—"}
                    </Text>
                  </View>
                </View>

                {/* Change details */}
                <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
                  <View style={styles.detailCol}>
                    <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                      {t("currentValue")}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>
                      {req.currentValue || "—"}
                    </Text>
                  </View>
                  <Icon name="arrow-right" size={16} color={colors.mutedForeground} />
                  <View style={styles.detailCol}>
                    <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                      {t("requestedValue")}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>
                      {req.requestedValue || "—"}
                    </Text>
                  </View>
                </View>

                {/* Date */}
                <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                  {formatDate(req.createdAt)}
                </Text>

                {/* Admin reason (rejection note) */}
                {!!req.adminReason && (
                  <View style={[styles.reasonBox, { backgroundColor: "#DC262610", borderColor: "#DC2626" }]}>
                    <Icon name="alert-circle" size={14} color="#DC2626" />
                    <Text style={[styles.reasonText, { color: "#DC2626" }]}>
                      {req.adminReason}
                    </Text>
                  </View>
                )}

                {/* Actions — only for pending */}
                {isPending && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        styles.rejectBtn,
                        { borderColor: "#DC2626" },
                        isActioning && { opacity: 0.5 },
                      ]}
                      onPress={() => openRejectModal(req.id)}
                      disabled={!!actionId}
                    >
                      <Icon name="close" size={14} color="#DC2626" />
                      <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>
                        {t("reject")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        styles.approveBtn,
                        { backgroundColor: "#16A34A" },
                        isActioning && { opacity: 0.7 },
                      ]}
                      onPress={() => handleApprove(req)}
                      disabled={!!actionId}
                    >
                      {isActioning ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Icon name="check-circle" size={14} color="#fff" />
                          <Text style={[styles.actionBtnText, { color: "#fff" }]}>
                            {t("approve")}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Rejection Reason Modal */}
      <Modal
        transparent
        animationType="slide"
        visible={rejectModal.visible}
        statusBarTranslucent
        onRequestClose={() =>
          setRejectModal({ visible: false, requestId: "", reason: "", submitting: false })
        }
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() =>
              !rejectModal.submitting &&
              setRejectModal({ visible: false, requestId: "", reason: "", submitting: false })
            }
          >
            <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <View style={[styles.modalIconWrap, { backgroundColor: "#DC262615" }]}>
                  <Icon name="alert-circle" size={20} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                    {t("rejectionReason")}
                  </Text>
                </View>
              </View>
              <TextInput
                style={[
                  styles.reasonInput,
                  {
                    borderColor: colors.border,
                    color: colors.foreground,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder={t("rejectionReasonPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={rejectModal.reason}
                onChangeText={(v) => setRejectModal((prev) => ({ ...prev, reason: v }))}
                multiline
                numberOfLines={3}
                autoFocus
                textAlignVertical="top"
              />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                  onPress={() =>
                    setRejectModal({ visible: false, requestId: "", reason: "", submitting: false })
                  }
                  disabled={rejectModal.submitting}
                >
                  <Text style={[styles.modalBtnText, { color: colors.foreground }]}>
                    {t("cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalConfirmBtn,
                    { backgroundColor: "#DC2626" },
                    rejectModal.submitting && { opacity: 0.7 },
                  ]}
                  onPress={handleReject}
                  disabled={rejectModal.submitting}
                >
                  {rejectModal.submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: "#fff" }]}>
                      {t("submitRejection")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
    gap: 12,
  },
  backBtn: { padding: 6 },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  scroll: { padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  fieldPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: "auto",
  },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  detailCol: { flex: 1 },
  detailLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginBottom: 2 },
  detailValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  dateText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  reasonBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  reasonText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
  },
  rejectBtn: { borderWidth: 1.5 },
  approveBtn: {},
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Rejection Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 14,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignSelf: "center",
    marginBottom: 4,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  reasonInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 90,
  },
  modalBtnRow: { flexDirection: "row", gap: 10 },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
