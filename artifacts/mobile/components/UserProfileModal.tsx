import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Icon } from "@/components/Icon";
import { useAuth, UserProfile } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

interface UserProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

function roleLabel(role: string): string {
  if (role === "super_admin") return "Super Admin";
  if (role === "assistant_admin") return "Admin";
  return "Employee";
}

function roleColor(role: string): string {
  if (role === "super_admin") return "#BC9B5D";
  if (role === "assistant_admin") return "#16A8BA";
  return "#2D6491";
}

export function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const colors = useColors();
  const { t } = useT();
  const { profile: myProfile, isSuperAdmin, activeSuperAdminEmail, promoteToAssistantAdmin, demoteFromAdmin } = useAuth();
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!userId) { setTargetUser(null); return; }
    setLoading(true);
    getDoc(doc(db, "users", userId))
      .then((snap) => {
        if (snap.exists()) setTargetUser({ uid: snap.id, ...snap.data() } as UserProfile);
        else setTargetUser(null);
      })
      .catch(() => setTargetUser(null))
      .finally(() => setLoading(false));
  }, [userId]);

  const isSelf = targetUser?.uid === myProfile?.uid;
  const isSuperAdminAccount =
    !!targetUser && !!activeSuperAdminEmail &&
    targetUser.email.toLowerCase() === activeSuperAdminEmail.toLowerCase();

  const handlePromote = async () => {
    if (!targetUser) return;
    setActionLoading(true);
    try { await promoteToAssistantAdmin(targetUser.uid); }
    catch (_) {}
    finally { setActionLoading(false); onClose(); }
  };

  const handleDemote = async () => {
    if (!targetUser) return;
    setActionLoading(true);
    try { await demoteFromAdmin(targetUser.uid); }
    catch (_) {}
    finally { setActionLoading(false); onClose(); }
  };

  return (
    <Modal
      visible={!!userId}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.handle} />

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : !targetUser ? (
            <View style={styles.loadingBox}>
              <Icon name="alert-circle" size={32} color={colors.border} />
              <Text style={[styles.notFound, { color: colors.mutedForeground }]}>
                Profile not found
              </Text>
            </View>
          ) : (
            <>
              {/* Avatar + name + role */}
              <View style={styles.avatarRow}>
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarText}>
                    {targetUser.displayName?.charAt(0)?.toUpperCase() || "?"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                      {targetUser.displayName || "—"}
                    </Text>
                    {isSelf && (
                      <Text style={[styles.selfTag, { color: colors.mutedForeground }]}>{t("you")}</Text>
                    )}
                  </View>
                  <View style={[styles.rolePill, { backgroundColor: roleColor(targetUser.role) + "20", marginTop: 4 }]}>
                    <Text style={[styles.roleText, { color: roleColor(targetUser.role) }]}>
                      {roleLabel(targetUser.role)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Profile fields */}
              {[
                { label: "Email",               value: targetUser.email },
                { label: t("employeeNumber"),   value: targetUser.employeeNumber || "—" },
                { label: t("department"),       value: targetUser.department || "—" },
                { label: "Phone",               value: targetUser.phone || "—" },
                { label: "Active",              value: targetUser.isActive !== false ? "Yes" : "No" },
              ].map(({ label, value }) => (
                <View key={label} style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <Text style={[styles.fieldValue, { color: colors.foreground }]}>{value}</Text>
                </View>
              ))}

              {/* Promote / demote — super_admin only, not self, not super_admin account */}
              {!isSelf && !isSuperAdminAccount && isSuperAdmin && (
                <View style={{ marginTop: 16 }}>
                  {targetUser.role === "user" ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.secondary + "15", borderColor: colors.secondary }]}
                      onPress={handlePromote}
                      disabled={actionLoading}
                    >
                      <Icon name="person-add" size={13} color={colors.secondary} />
                      <Text style={[styles.actionBtnText, { color: colors.secondary }]}>{t("promoteToAdmin")}</Text>
                    </TouchableOpacity>
                  ) : targetUser.role === "assistant_admin" ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive }]}
                      onPress={handleDemote}
                      disabled={actionLoading}
                    >
                      <Icon name="person-remove" size={13} color={colors.destructive} />
                      <Text style={[styles.actionBtnText, { color: colors.destructive }]}>{t("demoteFromAdmin")}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {actionLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            style={[styles.closeBtn, { borderColor: colors.border, marginTop: 16 }]}
            onPress={onClose}
          >
            <Text style={[styles.closeBtnText, { color: colors.foreground }]}>{t("cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 20,
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  notFound: { fontSize: 14, fontFamily: "Inter_400Regular" },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  name: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  selfTag: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  rolePill: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldValue: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "right", flex: 1, marginLeft: 16 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  closeBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
