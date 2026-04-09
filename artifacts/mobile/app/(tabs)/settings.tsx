import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

/**
 * All sub-components are defined at MODULE LEVEL (not inside SettingsScreen).
 * This is critical: components defined inside a render function get a new
 * function reference on every parent re-render. React treats them as a new
 * component type, unmounts the old instance, and mounts a new one — causing
 * TextInput to lose focus on every keystroke (the keyboard bug).
 * By defining them at module level they have stable identities across renders.
 */

function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
      {title.toUpperCase()}
    </Text>
  );
}

interface FieldRowProps {
  label: string;
  value: string;
  setter: (v: string) => void;
  icon: IconName;
  keyboard?: "default" | "email-address" | "phone-pad" | "numeric";
  editable?: boolean;
  returnKeyType?: "next" | "done";
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
}

function FieldRow({
  label,
  value,
  setter,
  icon,
  keyboard = "default",
  editable = true,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
}: FieldRowProps) {
  const colors = useColors();
  const { isRTL } = useT();
  return (
    <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
      <View style={styles.fieldIcon}>
        <Icon name={icon} size={16} color={colors.mutedForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <TextInput
          style={[
            styles.fieldInput,
            { color: editable ? colors.foreground : colors.mutedForeground },
          ]}
          value={value}
          onChangeText={setter}
          keyboardType={keyboard}
          autoCapitalize={keyboard === "email-address" ? "none" : "words"}
          autoCorrect={false}
          textAlign={isRTL ? "right" : "left"}
          editable={editable}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
        />
      </View>
    </View>
  );
}

interface AdminActionRowProps {
  icon: IconName;
  label: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  showArrow?: boolean;
}

function AdminActionRow({
  icon,
  label,
  subtitle,
  onPress,
  destructive = false,
  showArrow = true,
}: AdminActionRowProps) {
  const colors = useColors();
  const color = destructive ? "#DC2626" : colors.primary;
  return (
    <TouchableOpacity
      style={[styles.adminRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
    >
      <View style={[styles.adminIconWrap, { backgroundColor: color + "15" }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.adminRowLabel,
            { color: destructive ? "#DC2626" : colors.foreground },
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text style={[styles.adminRowSub, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showArrow && (
        <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
      )}
    </TouchableOpacity>
  );
}

// ── Polished confirmation modal ────────────────────────────────────────────
interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const colors = useColors();
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <View style={[styles.modalIconWrap, { backgroundColor: (destructive ? "#DC2626" : colors.primary) + "15" }]}>
            <Icon
              name={destructive ? "logout" : "info-circle"}
              size={22}
              color={destructive ? "#DC2626" : colors.primary}
            />
          </View>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.modalMessage, { color: colors.mutedForeground }]}>{message}</Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={[styles.modalBtnText, { color: colors.foreground }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalBtn,
                styles.modalBtnConfirm,
                { backgroundColor: destructive ? "#DC2626" : colors.primary },
                loading && { opacity: 0.7 },
              ]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.modalBtnText, { color: "#fff" }]}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { t, isRTL, language } = useT();
  const {
    user,
    profile,
    isSuperAdmin,
    isAdmin,
    logout,
    updateUserProfile,
    setLanguage,
  } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [employeeNumber, setEmployeeNumber] = useState(profile?.employeeNumber || "");
  const [department, setDepartment] = useState(profile?.department || "");
  const [phone, setPhone] = useState(profile?.phone || "");

  // Sync local state when profile updates from Firestore (e.g. after auto-patch)
  React.useEffect(() => {
    if (profile?.employeeNumber && profile.employeeNumber !== employeeNumber) {
      setEmployeeNumber(profile.employeeNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.employeeNumber]);

  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeletionModal, setShowDeletionModal] = useState(false);

  const handleRequestDeletion = () => {
    setShowDeletionModal(true);
  };

  const confirmDeletion = async () => {
    if (!user || !profile) return;
    setRequestingDeletion(true);
    try {
      await addDoc(collection(db, "deletion_requests"), {
        userId: user.uid,
        userEmail: profile.email,
        userName: profile.displayName,
        status: "pending",
        reason: "",
        createdAt: serverTimestamp(),
      });
      setShowDeletionModal(false);
      Alert.alert(t("success"), t("deletionRequestSent"));
    } catch (e: unknown) {
      Alert.alert(t("error"), (e as { message?: string }).message);
    } finally {
      setRequestingDeletion(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserProfile({ displayName, department, phone, employeeNumber });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t("success"), t("profileUpdated"));
    } catch (e: unknown) {
      Alert.alert(t("error"), (e as { message?: string }).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    await logout();
    setShowLogoutModal(false);
    router.replace("/auth/login" as never);
  };

  const toggleLanguage = async (toArabic: boolean) => {
    await setLanguage(toArabic ? "ar" : "en");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const roleBadgeLabel = () => {
    if (profile?.role === "super_admin") return t("superAdmin");
    if (profile?.role === "assistant_admin") return t("assistantAdmin");
    return null;
  };

  const roleBadgeColor = () => {
    if (profile?.role === "super_admin") return colors.accent;
    if (profile?.role === "assistant_admin") return colors.secondary;
    return colors.primary;
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
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
          {t("settings")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom:
              insets.bottom + (Platform.OS === "web" ? 34 : 100),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Avatar */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {profile?.displayName?.charAt(0)?.toUpperCase() || "U"}
            </Text>
          </View>
          <Text style={[styles.userName, { color: colors.foreground }]}>
            {profile?.displayName}
          </Text>
          <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>
            {profile?.email}
          </Text>
          {!!profile?.employeeNumber && (
            <Text
              style={[styles.employeeNum, { color: colors.mutedForeground }]}
            >
              #{profile.employeeNumber}
            </Text>
          )}
          {roleBadgeLabel() && (
            <View
              style={[
                styles.roleBadge,
                { backgroundColor: roleBadgeColor() + "20" },
              ]}
            >
              <Icon name="shield-check" size={10} color={roleBadgeColor()} />
              <Text style={[styles.roleText, { color: roleBadgeColor() }]}>
                {roleBadgeLabel()}
              </Text>
            </View>
          )}
        </View>

        {/* Profile Settings */}
        <SectionHeader title={t("profileSettings")} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Email — always read-only; changing email requires re-auth */}
          <FieldRow
            label={t("email")}
            value={profile?.email || ""}
            setter={() => {}}
            icon="mail"
            keyboard="email-address"
            editable={false}
          />
          <FieldRow
            label={t("fullName")}
            value={displayName}
            setter={setDisplayName}
            icon="person"
            returnKeyType="next"
            blurOnSubmit={false}
          />
          <FieldRow
            label={t("department")}
            value={department}
            setter={setDepartment}
            icon="briefcase"
            returnKeyType="next"
            blurOnSubmit={false}
          />
          <FieldRow
            label={t("phone")}
            value={phone}
            setter={setPhone}
            icon="phone"
            keyboard="phone-pad"
            returnKeyType="next"
            blurOnSubmit={false}
          />
          <FieldRow
            label={t("employeeNumber")}
            value={employeeNumber}
            setter={setEmployeeNumber}
            icon="tag"
            keyboard="default"
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: colors.primary },
              saving && { opacity: 0.7 },
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>{t("saveChanges")}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Language */}
        <SectionHeader title={t("language")} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.langRow}>
            <View>
              <Text style={[styles.langLabel, { color: colors.foreground }]}>
                {t("arabic")}
              </Text>
              <Text style={[styles.langSub, { color: colors.mutedForeground }]}>
                عربي
              </Text>
            </View>
            <Switch
              value={language === "ar"}
              onValueChange={toggleLanguage}
              trackColor={{ false: colors.border, true: colors.secondary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Super Admin Settings */}
        {isSuperAdmin && (
          <>
            <SectionHeader title={t("superAdminSettings")} />
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <AdminActionRow
                icon="people"
                label={t("manageAssistantAdmins")}
                subtitle={t("promoteSubtitle")}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/admin",
                    params: { tab: "users" },
                  } as never)
                }
              />
              <AdminActionRow
                icon="refresh"
                label={t("transferSuperAdmin")}
                subtitle={t("transferSubtitle")}
                onPress={() => router.push("/transfer-super-admin" as never)}
                destructive
              />
              <AdminActionRow
                icon="download"
                label={t("exportData")}
                subtitle={t("exportSubtitle")}
                onPress={() => router.push("/admin/export-data" as never)}
              />
              <AdminActionRow
                icon="trash"
                label={t("deletionRequests")}
                subtitle={t("deletionSubtitle")}
                onPress={() => router.push("/admin/deletion-requests" as never)}
              />
            </View>
          </>
        )}

        {/* Account Deletion — regular users only */}
        {!isAdmin && (
          <>
            <SectionHeader title={t("accountActions")} />
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <AdminActionRow
                icon="person-remove"
                label={t("deleteAccount")}
                subtitle={t("deleteAccountDesc")}
                onPress={handleRequestDeletion}
                destructive
                showArrow={false}
              />
            </View>
          </>
        )}

        {/* Account / Sign Out */}
        <SectionHeader title={t("account")} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: colors.destructive }]}
            onPress={() => setShowLogoutModal(true)}
            disabled={loggingOut || requestingDeletion}
          >
            {loggingOut ? (
              <ActivityIndicator color={colors.destructive} size="small" />
            ) : (
              <>
                <Icon name="logout" size={18} color={colors.destructive} />
                <Text
                  style={[
                    styles.logoutText,
                    { color: colors.destructive },
                  ]}
                >
                  {t("logout")}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.logoFooter}>
          <Logo size="small" />
          <Text style={[styles.version, { color: colors.mutedForeground }]}>
            Arabian Fal Legal Platform v1.0
          </Text>
        </View>
      </ScrollView>

      {/* Polished Logout Modal */}
      <ConfirmModal
        visible={showLogoutModal}
        title={t("logout")}
        message={t("logoutConfirmMsg")}
        confirmLabel={t("signOut")}
        cancelLabel={t("cancel")}
        destructive
        loading={loggingOut}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutModal(false)}
      />

      {/* Polished Account Deletion Modal */}
      <ConfirmModal
        visible={showDeletionModal}
        title={t("deleteAccountConfirmTitle")}
        message={t("deleteAccountConfirmMessage")}
        confirmLabel={t("submitRequest")}
        cancelLabel={t("cancel")}
        destructive
        loading={requestingDeletion}
        onConfirm={confirmDeletion}
        onCancel={() => setShowDeletionModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  scroll: { padding: 16 },
  avatarSection: { alignItems: "center", marginBottom: 24, gap: 6 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  employeeNum: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 4,
  },
  roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    marginTop: 20,
    letterSpacing: 0.5,
  },
  card: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  fieldIcon: { marginRight: 12 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  fieldInput: { fontSize: 15, fontFamily: "Inter_400Regular", paddingTop: 2 },
  saveBtn: { margin: 16, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  langRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  langLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  langSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  adminIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  adminRowLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  adminRowSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 16,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
  },
  logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  logoFooter: { alignItems: "center", marginTop: 32, gap: 8 },
  version: { fontSize: 11, fontFamily: "Inter_400Regular" },
  textRTL: { textAlign: "right" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnCancel: {
    borderWidth: 1.5,
  },
  modalBtnConfirm: {},
  modalBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
