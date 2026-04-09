import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Icon } from "@/components/Icon";
import { RequestCard, Request } from "@/components/RequestCard";
import { UserProfileModal } from "@/components/UserProfileModal";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth, UserProfile, UserRole } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type Status =
  | "Submitted"
  | "Under Review"
  | "Employee Contacted"
  | "In Progress"
  | "Proposed Resolution"
  | "Employee Feedback"
  | "Resolved / Closed"
  | "Escalated";

const STATUS_OPTIONS: Status[] = [
  "Submitted",
  "Under Review",
  "Employee Contacted",
  "In Progress",
  "Proposed Resolution",
  "Employee Feedback",
  "Resolved / Closed",
  "Escalated",
];

type AdminTab = "requests" | "users";

export default function AdminScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { user, profile, isAdmin, isSuperAdmin, activeSuperAdminEmail, promoteToAssistantAdmin, demoteFromAdmin, getAllUsers } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();

  const [activeTab, setActiveTab] = useState<AdminTab>("requests");
  const [requests, setRequests] = useState<Request[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [actionUser, setActionUser] = useState<UserProfile | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);

  // ── Jump to Users tab when navigated with ?tab=users ────────────────────
  useEffect(() => {
    if (tabParam === "users" && isSuperAdmin) {
      setActiveTab("users");
    }
  }, [tabParam, isSuperAdmin]);

  // ── ALL hooks must run before any early return ──────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Request)));
        setLoadingRequests(false);
      },
      () => setLoadingRequests(false)
    );
    return unsub;
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === "users" && isSuperAdmin) {
      setLoadingUsers(true);
      getAllUsers()
        .then(setUsers)
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }, [activeTab, isSuperAdmin]);

  // ── Guard: non-admins see access-denied after all hooks have run ────────
  if (!isAdmin) {
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

  const counts = {
    total: requests.length,
    submitted: requests.filter((r) => r.status === "Submitted").length,
    active: requests.filter((r) => r.status !== "Resolved / Closed").length,
    resolved: requests.filter((r) => r.status === "Resolved / Closed").length,
  };

  const filtered =
    filterStatus === "all" ? requests : requests.filter((r) => r.status === filterStatus);

  const updateStatus = async (newStatus: Status) => {
    if (!selectedRequest) return;
    setUpdatingStatus(true);
    try {
      const now = serverTimestamp();
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        updatedAt: now,
        statusChangedAt: now,
        statusChangedBy: profile?.uid ?? null,
      };
      if (newStatus === "Resolved / Closed") {
        updatePayload.closedAt = now;
        updatePayload.closedBy = profile?.uid ?? null;
      }
      await updateDoc(doc(db, "requests", selectedRequest.id), updatePayload);
      setSelectedRequest(null);
      Alert.alert(t("success"), t("requestUpdated"));
    } catch (e: unknown) {
      console.error("[Admin] Status update error:", (e as Error).message);
      Alert.alert(t("error"), t("errStatusUpdate"));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePromote = (target: UserProfile) => {
    Alert.alert(t("promoteToAdmin"), t("confirmPromote"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("confirm"),
        onPress: async () => {
          setActionLoading(true);
          try {
            await promoteToAssistantAdmin(target.uid);
            setUsers((prev) =>
              prev.map((u) => (u.uid === target.uid ? { ...u, role: "assistant_admin" } : u))
            );
            Alert.alert(t("success"), `${target.displayName} ${t("promotedSuccess")}`);
          } catch (e: unknown) {
            console.error("[Admin] Promote error:", (e as Error).message);
            Alert.alert(t("error"), t("errPermission"));
          } finally {
            setActionLoading(false);
            setActionUser(null);
          }
        },
      },
    ]);
  };

  const handleDemote = (target: UserProfile) => {
    Alert.alert(t("demoteFromAdmin"), t("confirmDemote"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("confirm"),
        style: "destructive",
        onPress: async () => {
          setActionLoading(true);
          try {
            await demoteFromAdmin(target.uid);
            setUsers((prev) =>
              prev.map((u) => (u.uid === target.uid ? { ...u, role: "user" } : u))
            );
            Alert.alert(t("success"), `${target.displayName} ${t("demotedSuccess")}`);
          } catch (e: unknown) {
            console.error("[Admin] Demote error:", (e as Error).message);
            Alert.alert(t("error"), t("errPermission"));
          } finally {
            setActionLoading(false);
            setActionUser(null);
          }
        },
      },
    ]);
  };

  const roleLabel = (role: UserRole): string => {
    if (role === "super_admin") return t("superAdmin");
    if (role === "assistant_admin") return t("assistantAdmin");
    return t("regularUser");
  };

  const roleColor = (role: UserRole): string => {
    if (role === "super_admin") return colors.accent;
    if (role === "assistant_admin") return colors.secondary;
    return colors.mutedForeground;
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
        <View>
          <Text style={[styles.headerTitle, isRTL && styles.textRTL]}>
            {t("adminDashboard")}
          </Text>
          {isSuperAdmin && (
            <View style={styles.superAdminBadge}>
              <Icon name="shield-check" size={11} color={colors.accent} />
              <Text style={[styles.superAdminLabel, { color: colors.accent }]}>
                {t("superAdmin")}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "requests" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab("requests")}
        >
          <Text style={[styles.tabText, { color: activeTab === "requests" ? colors.primary : colors.mutedForeground }]}>
            {t("manageRequests")}
          </Text>
        </TouchableOpacity>
        {isSuperAdmin && (
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "users" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab("users")}
          >
            <Text style={[styles.tabText, { color: activeTab === "users" ? colors.primary : colors.mutedForeground }]}>
              {t("userManagement")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {activeTab === "requests" ? (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
          ]}
        >
          {/* Stats */}
          <View style={styles.statsGrid}>
            {[
              { label: t("statTotal"), value: counts.total, color: colors.primary },
              { label: t("statSubmitted"), value: counts.submitted, color: "#D97706" },
              { label: t("statActive"), value: counts.active, color: colors.secondary },
              { label: t("statResolved"), value: counts.resolved, color: "#16A34A" },
            ].map((s) => (
              <View
                key={s.label}
                style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Status filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(["all", ...STATUS_OPTIONS] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filterStatus === f ? colors.primary : colors.card,
                    borderColor: filterStatus === f ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setFilterStatus(f)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: filterStatus === f ? "#fff" : colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {f === "all" ? t("all") : t(({
                    "Submitted": "statusSubmitted",
                    "Under Review": "statusUnderReview",
                    "Employee Contacted": "statusEmployeeContacted",
                    "In Progress": "statusInProgress",
                    "Proposed Resolution": "statusProposedResolution",
                    "Employee Feedback": "statusEmployeeFeedback",
                    "Resolved / Closed": "statusResolvedClosed",
                    "Escalated": "statusEscalated",
                  } as Record<string, Parameters<typeof t>[0]>)[f] ?? "statusSubmitted")}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.requestsList}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t("manageRequests")} ({filtered.length})
            </Text>
            <Text style={[styles.longPressHint, { color: colors.mutedForeground }]}>
              {t("longPressHint")}
            </Text>
            {loadingRequests ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noData")}</Text>
              </View>
            ) : (
              filtered.map((req) => (
                <TouchableOpacity key={req.id} onLongPress={() => setSelectedRequest(req)} activeOpacity={0.9}>
                  <RequestCard
                    request={req}
                    showUser
                    currentUserId={user?.uid}
                    onSenderPress={(uid) => setProfileModalUserId(uid)}
                  />
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
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
                const order: Record<string, number> = { super_admin: 0, assistant_admin: 1, user: 2 };
                return order[a.role] - order[b.role];
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
                        onPress={() => setSelectedUser(u)}
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
                            {u.role === "user" ? (
                              <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: colors.secondary + "15", borderColor: colors.secondary }]}
                                onPress={() => handlePromote(u)}
                                disabled={actionLoading}
                              >
                                <Icon name="person-add" size={13} color={colors.secondary} />
                                <Text style={[styles.actionBtnText, { color: colors.secondary }]}>
                                  {t("promoteToAdmin")}
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive }]}
                                onPress={() => handleDemote(u)}
                                disabled={actionLoading}
                              >
                                <Icon name="person-remove" size={13} color={colors.destructive} />
                                <Text style={[styles.actionBtnText, { color: colors.destructive }]}>
                                  {t("demoteFromAdmin")}
                                </Text>
                              </TouchableOpacity>
                            )}
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
      )}

      {/* Send to Employee FAB — only in requests tab */}
      {activeTab === "requests" && (
        <TouchableOpacity
          style={[
            styles.fab,
            {
              backgroundColor: colors.secondary,
              bottom: insets.bottom + (Platform.OS === "web" ? 100 : 90),
            },
          ]}
          onPress={() => router.push("/admin/send-to-employee" as never)}
          activeOpacity={0.85}
        >
          <Icon name="send-to-employee" size={20} color="#fff" />
          <Text style={styles.fabText}>{t("sendToEmployee")}</Text>
        </TouchableOpacity>
      )}

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
                  {/* Avatar + name */}
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

                  {/* Fields */}
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

                  {/* Promote/demote action inside modal */}
                  {!isSelf && !isSuperAdminAccount && isSuperAdmin && (
                    <View style={{ marginTop: 16 }}>
                      {u.role === "user" ? (
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: colors.secondary + "15", borderColor: colors.secondary }]}
                          onPress={() => { setSelectedUser(null); handlePromote(u); }}
                          disabled={actionLoading}
                        >
                          <Icon name="person-add" size={13} color={colors.secondary} />
                          <Text style={[styles.actionBtnText, { color: colors.secondary }]}>
                            {t("promoteToAdmin")}
                          </Text>
                        </TouchableOpacity>
                      ) : u.role === "assistant_admin" ? (
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive }]}
                          onPress={() => { setSelectedUser(null); handleDemote(u); }}
                          disabled={actionLoading}
                        >
                          <Icon name="person-remove" size={13} color={colors.destructive} />
                          <Text style={[styles.actionBtnText, { color: colors.destructive }]}>
                            {t("demoteFromAdmin")}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}
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

      {/* User Profile Modal — from request card sender taps */}
      <UserProfileModal userId={profileModalUserId} onClose={() => setProfileModalUserId(null)} />

      {/* Status Update Modal */}
      <Modal
        visible={!!selectedRequest}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedRequest(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t("updateStatus")}
            </Text>
            {selectedRequest && (
              <Text
                style={[styles.modalSubtitle, { color: colors.mutedForeground }]}
                numberOfLines={2}
              >
                {selectedRequest.title}
              </Text>
            )}
            <View style={styles.statusOptions}>
              {STATUS_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.statusOption,
                    { borderColor: colors.border, backgroundColor: colors.background },
                    selectedRequest?.status === s && {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + "15",
                    },
                  ]}
                  onPress={() => updateStatus(s)}
                  disabled={updatingStatus}
                >
                  <StatusBadge status={s} />
                  {selectedRequest?.status === s && (
                    <Icon name="check" size={14} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            {updatingStatus && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
            )}
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => setSelectedRequest(null)}
            >
              <Text style={[styles.cancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
            </TouchableOpacity>
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
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scroll: { padding: 16 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: {
    width: "47%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
  },
  statValue: { fontSize: 28, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
  filterRow: { paddingVertical: 10, paddingHorizontal: 4, flexDirection: "row" },
  filterChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexShrink: 0,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flexShrink: 0,
  },
  requestsList: { marginTop: 8 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },
  longPressHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 12 },
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
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16 },
  statusOptions: { gap: 10 },
  statusOption: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cancelBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  textRTL: { textAlign: "right" },
  fab: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

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
