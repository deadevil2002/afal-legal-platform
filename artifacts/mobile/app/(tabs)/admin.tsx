import {
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useDialog } from "@/context/DialogContext";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Icon } from "@/components/Icon";
import { useAuth, UserProfile, UserRole, AnyUserRole } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

const NEW_ROLES: Array<{ role: UserRole; color: string }> = [
  { role: "ceo",         color: "#7C3AED" },
  { role: "evp",         color: "#5D1E5E" },
  { role: "operations",  color: "#B45309" },
  { role: "planning",    color: "#006485" },
  { role: "finance",     color: "#16A8BA" },
  { role: "procurement", color: "#2D6491" },
];

export default function AdminScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { profile, isSuperAdmin, activeSuperAdminEmail, promoteToAssistantAdmin, demoteFromAdmin, updateUserRole, getAllUsers, deleteUserByAdmin } = useAuth();
  const { showSuccess, showError, showConfirm } = useDialog();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionUser, setActionUser] = useState<UserProfile | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [deleteUserModal, setDeleteUserModal] = useState<{
    visible: boolean;
    target: UserProfile | null;
    password: string;
    loading: boolean;
    error: string;
  }>({ visible: false, target: null, password: "", loading: false, error: "" });

  // ── Role editing state (used in user detail modal) ────────────────────────
  const [editingRole, setEditingRole] = useState<AnyUserRole>("procurement");
  const [editingCanSubmit, setEditingCanSubmit] = useState(false);
  const [roleUpdateLoading, setRoleUpdateLoading] = useState(false);

  // ── Load users on mount for super_admin ──────────────────────────────────
  useEffect(() => {
    if (!isSuperAdmin) return;
    setLoadingUsers(true);
    getAllUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [isSuperAdmin]);

  // ── Guard: non-super-admins see access-denied after all hooks have run ───
  if (!isSuperAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="lock" size={48} color={colors.border} />
        <Text style={[styles.accessDenied, { color: colors.foreground }]}>{t("accessDenied")}</Text>
        <Text style={[styles.accessSub, { color: colors.mutedForeground }]}>
          {t("adminRequired")}
        </Text>
      </View>
    );
  }

  const handlePromote = (target: UserProfile) => {
    showConfirm({
      title: t("promoteToAdmin"),
      message: t("confirmPromote"),
      confirmText: t("confirm"),
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await promoteToAssistantAdmin(target.uid);
          setUsers((prev) =>
            prev.map((u) => (u.uid === target.uid ? { ...u, role: "assistant_admin" } : u))
          );
          showSuccess(`${target.displayName} ${t("promotedSuccess")}`, t("success"));
        } catch (e: unknown) {
          showError(t("errPermission"), t("error"));
        } finally {
          setActionLoading(false);
          setActionUser(null);
        }
      },
    });
  };

  const handleDemote = (target: UserProfile) => {
    showConfirm({
      title: t("demoteFromAdmin"),
      message: t("confirmDemote"),
      confirmText: t("confirm"),
      destructive: true,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await demoteFromAdmin(target.uid);
          setUsers((prev) =>
            prev.map((u) => (u.uid === target.uid ? { ...u, role: "user" } : u))
          );
          showSuccess(`${target.displayName} ${t("demotedSuccess")}`, t("success"));
        } catch (e: unknown) {
          showError(t("errPermission"), t("error"));
        } finally {
          setActionLoading(false);
          setActionUser(null);
        }
      },
    });
  };

  const openDeleteUserModal = (target: UserProfile) => {
    setSelectedUser(null);
    setDeleteUserModal({ visible: true, target, password: "", loading: false, error: "" });
  };

  const handleDeleteUser = async () => {
    if (!deleteUserModal.target) return;
    if (!deleteUserModal.password.trim()) {
      setDeleteUserModal((prev) => ({ ...prev, error: t("deleteUserPassword") }));
      return;
    }
    setDeleteUserModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      await deleteUserByAdmin(deleteUserModal.target.uid, deleteUserModal.password);
      setUsers((prev) => prev.filter((u) => u.uid !== deleteUserModal.target!.uid));
      setDeleteUserModal({ visible: false, target: null, password: "", loading: false, error: "" });
      showSuccess(t("deleteUserSuccess"), t("success"));
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const msg = err.code === "auth/wrong-password" || err.code === "auth/invalid-credential"
        ? t("wrongPassword")
        : (err.message ?? t("errGeneric"));
      setDeleteUserModal((prev) => ({ ...prev, loading: false, error: msg }));
    }
  };

  const roleLabel = (role: string): string => {
    if (role === "super_admin") return t("roleSuperAdmin");
    if (role === "ceo") return t("roleCeo");
    if (role === "evp") return t("roleEvp");
    if (role === "operations") return t("roleOperations");
    if (role === "planning") return t("rolePlanning");
    if (role === "finance") return t("roleFinance");
    if (role === "procurement") return t("roleProcurement");
    if (role === "assistant_admin") return t("roleLegacyAdmin");
    return t("roleLegacyUser");
  };

  const roleColor = (role: string): string => {
    if (role === "super_admin") return colors.accent;
    if (role === "ceo") return "#7C3AED";
    if (role === "evp") return "#5D1E5E";
    if (role === "operations") return "#B45309";
    if (role === "planning") return "#006485";
    if (role === "finance") return colors.secondary;
    if (role === "procurement") return colors.primary;
    return colors.mutedForeground;
  };

  const handleRoleUpdate = async () => {
    if (!selectedUser || !editingRole) return;
    if (editingRole === "user" || editingRole === "assistant_admin") return;
    setRoleUpdateLoading(true);
    try {
      await updateUserRole(selectedUser.uid, editingRole as UserRole, editingCanSubmit);
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === selectedUser.uid
            ? { ...u, role: editingRole, canSubmitRequests: editingCanSubmit }
            : u
        )
      );
      setSelectedUser(null);
      showSuccess(t("roleAssigned"), t("success"));
    } catch (e: unknown) {
      showError(t("errPermission"), t("error"));
    } finally {
      setRoleUpdateLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: "#112B4D",
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
          <View>
            <Text style={[styles.headerTitle, isRTL && styles.textRTL]}>
              {t("adminDashboard")}
            </Text>
            <View style={styles.superAdminBadge}>
              <Icon name="shield-check" size={11} color={colors.accent} />
              <Text style={[styles.superAdminLabel, { color: colors.accent }]}>
                {t("superAdmin")}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.headerAddBtn}
            onPress={() => router.push("/admin/create-user" as never)}
            activeOpacity={0.75}
          >
            <Icon name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
        ]}
      >
        <View style={[styles.infoBox, { backgroundColor: colors.accent + "15", borderColor: colors.accent }]}>
          <Icon name="info-circle" size={14} color={colors.accent} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>
            {t("superAdminHint")}
          </Text>
        </View>

        {/* Search bar */}
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Icon name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="Search by name, email or employee number…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {userSearch.length > 0 && (
            <TouchableOpacity onPress={() => setUserSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {(() => {
          const q = userSearch.trim().toLowerCase();
          const filteredUsers = users
            .sort((a, b) => {
              const order: Record<string, number> = {
                super_admin: 0,
                ceo: 1,
                evp: 2,
                operations: 3,
                planning: 4,
                finance: 5,
                procurement: 6,
                assistant_admin: 7,
                user: 8,
              };
              return (order[a.role] ?? 8) - (order[b.role] ?? 8);
            })
            .filter((u) => {
              if (!q) return true;
              return (
                u.displayName?.toLowerCase().includes(q) ||
                u.email?.toLowerCase().includes(q) ||
                (u.employeeNumber ?? "").toLowerCase().includes(q)
              );
            });

          return (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t("userManagement")} ({filteredUsers.length}{q ? ` of ${users.length}` : ""})
              </Text>

              {loadingUsers ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
              ) : filteredUsers.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    {q ? "No users match your search." : t("noData")}
                  </Text>
                </View>
              ) : (
                filteredUsers.map((u) => {
                  const isSelf = u.uid === profile?.uid;
                  const isSuperAdminAccount =
                    u.email.toLowerCase() === activeSuperAdminEmail.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={u.uid}
                      style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => {
                        setSelectedUser(u);
                        setEditingRole(u.role);
                        setEditingCanSubmit(u.canSubmitRequests ?? false);
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={styles.userAvatar}>
                        <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
                          <Text style={styles.avatarInitial}>
                            {u.displayName?.charAt(0)?.toUpperCase() || "?"}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.userNameRow}>
                            <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
                              {u.displayName}
                            </Text>
                            {isSelf && (
                              <Text style={[styles.selfTag, { color: colors.mutedForeground }]}>{t("you")}</Text>
                            )}
                          </View>
                          <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {u.email}
                          </Text>
                          {u.employeeNumber ? (
                            <Text style={[styles.userDept, { color: colors.mutedForeground }]}>
                              #{u.employeeNumber}
                            </Text>
                          ) : null}
                          {u.department ? (
                            <Text style={[styles.userDept, { color: colors.mutedForeground }]}>
                              {u.department}
                            </Text>
                          ) : null}
                          <View style={[styles.rolePill, { backgroundColor: roleColor(u.role) + "20" }]}>
                            <Text style={[styles.roleText, { color: roleColor(u.role) }]}>
                              {roleLabel(u.role)}
                            </Text>
                          </View>
                        </View>
                        <Icon name="chevron-right" size={14} color={colors.mutedForeground} />
                      </View>

                      {!isSelf && !isSuperAdminAccount && isSuperAdmin && (
                        <View style={styles.userActions}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive }]}
                            onPress={(e) => { e.stopPropagation?.(); openDeleteUserModal(u); }}
                            disabled={actionLoading}
                          >
                            <Icon name="trash" size={13} color={colors.destructive} />
                            <Text style={[styles.actionBtnText, { color: colors.destructive }]}>
                              {t("deleteUser")}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          );
        })()}
      </ScrollView>

      {/* User Detail Modal */}
      <Modal
        visible={!!selectedUser}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            {selectedUser && (() => {
              const u = selectedUser;
              const isSelf = u.uid === profile?.uid;
              const isSuperAdminAccount = u.email.toLowerCase() === activeSuperAdminEmail.toLowerCase();
              return (
                <>
                  <View style={styles.detailAvatarRow}>
                    <View style={[styles.detailAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.detailAvatarText}>
                        {u.displayName?.charAt(0)?.toUpperCase() || "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.detailName, { color: colors.foreground }]}>
                          {u.displayName || "—"}
                        </Text>
                        {isSelf && (
                          <Text style={[styles.selfTag, { color: colors.mutedForeground }]}>{t("you")}</Text>
                        )}
                      </View>
                      <View style={[styles.rolePill, { backgroundColor: roleColor(u.role) + "20", marginTop: 4 }]}>
                        <Text style={[styles.roleText, { color: roleColor(u.role) }]}>
                          {roleLabel(u.role)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {[
                    { label: "Email", value: u.email },
                    { label: t("employeeNumber"), value: u.employeeNumber || "—" },
                    { label: t("department"), value: u.department || "—" },
                    { label: "Phone", value: u.phone || "—" },
                    { label: "Active", value: u.isActive !== false ? "Yes" : "No" },
                  ].map(({ label, value }) => (
                    <View key={label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
                      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
                    </View>
                  ))}

                  {!isSelf && !isSuperAdminAccount && isSuperAdmin && (() => {
                    const isLegacyRole = u.role === "user" || u.role === "assistant_admin";
                    const canSave =
                      editingRole !== "user" &&
                      editingRole !== "assistant_admin" &&
                      (editingRole !== u.role || editingCanSubmit !== (u.canSubmitRequests ?? false));
                    return (
                      <View style={{ marginTop: 16, gap: 10 }}>
                        {isLegacyRole && (
                          <View style={[styles.legacyBanner, { backgroundColor: "#F59E0B18", borderColor: "#F59E0B" }]}>
                            <Icon name="alert-circle" size={13} color="#F59E0B" />
                            <Text style={[styles.legacyBannerText, { color: "#92400E" }]}>
                              Legacy role — assign a new role below.
                            </Text>
                          </View>
                        )}

                        <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                          {t("assignRole")}
                        </Text>
                        <View style={styles.roleGrid}>
                          {NEW_ROLES.map(({ role, color }) => {
                            const selected = editingRole === role;
                            return (
                              <TouchableOpacity
                                key={role}
                                style={[
                                  styles.roleChip,
                                  { borderColor: color },
                                  selected && { backgroundColor: color + "22", borderWidth: 2 },
                                ]}
                                onPress={() => setEditingRole(role)}
                              >
                                <Text style={[styles.roleChipText, { color }]}>
                                  {roleLabel(role)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        <View style={[styles.canSubmitRow, { borderColor: colors.border }]}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={[styles.detailLabel, { color: colors.foreground }]}>
                              {t("canSubmitRequests")}
                            </Text>
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                              {t("canSubmitRequestsSubtitle")}
                            </Text>
                          </View>
                          <Switch
                            value={editingCanSubmit}
                            onValueChange={setEditingCanSubmit}
                            trackColor={{ false: colors.border, true: colors.secondary }}
                            thumbColor="#fff"
                          />
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            {
                              alignSelf: "stretch",
                              justifyContent: "center",
                              backgroundColor: canSave ? colors.primary : colors.border,
                              borderColor: canSave ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={handleRoleUpdate}
                          disabled={!canSave || roleUpdateLoading}
                        >
                          {roleUpdateLoading ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={[styles.actionBtnText, { color: "#fff" }]}>{t("save")}</Text>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive }]}
                          onPress={() => openDeleteUserModal(u)}
                          disabled={actionLoading}
                        >
                          <Icon name="trash" size={13} color={colors.destructive} />
                          <Text style={[styles.actionBtnText, { color: colors.destructive }]}>
                            {t("deleteUser")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </>
              );
            })()}
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border, marginTop: 16 }]}
              onPress={() => setSelectedUser(null)}
            >
              <Text style={[styles.cancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete User Modal */}
      <Modal
        visible={deleteUserModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteUserModal((p) => ({ ...p, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.statusModalCard, { backgroundColor: "#fff" }]}>
            <Text style={[styles.modalTitle, { color: "#1a1a1a", marginBottom: 4 }]}>
              {t("deleteUser")}
            </Text>
            {deleteUserModal.target && (
              <Text style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
                {deleteUserModal.target.displayName} · {deleteUserModal.target.email}
              </Text>
            )}
            <Text style={{ fontSize: 13, color: "#333", marginBottom: 8 }}>
              {t("deleteUserAdminPrompt")}
            </Text>
            <TextInput
              style={[
                styles.noteInput,
                { color: "#1a1a1a", borderColor: "#ccc", backgroundColor: "#f9f9f9", marginBottom: 4 },
              ]}
              placeholder={t("yourPassword")}
              placeholderTextColor="#999"
              secureTextEntry
              value={deleteUserModal.password}
              onChangeText={(v) => setDeleteUserModal((p) => ({ ...p, password: v, error: "" }))}
              editable={!deleteUserModal.loading}
            />
            {deleteUserModal.error ? (
              <Text style={{ color: "#e53935", fontSize: 12, marginBottom: 8 }}>
                {deleteUserModal.error}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.statusSaveBtn, { flex: 1, backgroundColor: "#e53935" }]}
                onPress={handleDeleteUser}
                disabled={deleteUserModal.loading}
              >
                {deleteUserModal.loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.statusSaveBtnText}>{t("deleteUser")}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusCancelBtn, { flex: 1 }]}
                onPress={() => setDeleteUserModal((p) => ({ ...p, visible: false }))}
                disabled={deleteUserModal.loading}
              >
                <Text style={styles.statusCancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  accessDenied: { fontSize: 20, fontFamily: "Inter_700Bold" },
  accessSub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  superAdminBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  superAdminLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  scroll: { padding: 16 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },
  emptyState: { alignItems: "center", marginTop: 40 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  userCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  userAvatar: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  selfTag: { fontSize: 10, fontFamily: "Inter_400Regular" },
  userEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  userDept: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  rolePill: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 5,
  },
  roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  userActions: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#DDD",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  cancelBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  statusModalCard: {
    margin: 24,
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 40,
  },
  statusSaveBtn: {
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statusSaveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  statusCancelBtn: {
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDD",
  },
  statusCancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#555" },
  textRTL: { textAlign: "right" },
  headerAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── User search ───────────────────────────────────────────────────────────
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },

  // ── Role picker (in user detail modal) ───────────────────────────────────
  legacyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  legacyBannerText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roleChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  roleChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  canSubmitRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },

  // ── User detail modal ─────────────────────────────────────────────────────
  detailAvatarRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  detailAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  detailAvatarText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  detailName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  detailLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 2, textAlign: "right" },
});
