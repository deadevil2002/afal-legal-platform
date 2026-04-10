import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import type { ProfileChangeRequest } from "@/context/AuthContext";
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

// ── Change Password Modal ──────────────────────────────────────────────────
// Defined at module level to ensure stable component identity across parent
// re-renders, keeping TextInput focus intact (same reason as FieldRow).
interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onChangePassword: (current: string, newPwd: string) => Promise<void>;
}

function ChangePasswordModal({ visible, onClose, onChangePassword }: ChangePasswordModalProps) {
  const colors = useColors();
  const { t } = useT();

  const [currentPwd, setCurrentPwd] = React.useState("");
  const [newPwd, setNewPwd] = React.useState("");
  const [confirmPwd, setConfirmPwd] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const reset = () => {
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError("");
    // Client-side validation
    if (!currentPwd.trim()) {
      setError(t("currentPassword") + " " + t("required").toLowerCase());
      return;
    }
    if (!newPwd.trim()) {
      setError(t("newPassword") + " " + t("required").toLowerCase());
      return;
    }
    if (newPwd.length < 8) {
      setError(t("passwordMin"));
      return;
    }
    if (newPwd !== confirmPwd) {
      setError(t("passwordMatch"));
      return;
    }
    setLoading(true);
    try {
      await onChangePassword(currentPwd, newPwd);
      reset();
      onClose();
      Alert.alert(t("success"), t("passwordChanged"));
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError(t("wrongPassword"));
      } else if (err.code === "auth/weak-password") {
        setError(t("passwordMin"));
      } else {
        setError(err.message ?? t("errGeneric"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.cpOverlay} onPress={handleClose}>
          <Pressable style={[styles.cpSheet, { backgroundColor: colors.card }]}>
            <View style={styles.cpHandle} />
            <View style={styles.cpHeader}>
              <View style={[styles.cpIconWrap, { backgroundColor: colors.primary + "15" }]}>
                <Icon name="lock" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cpTitle, { color: colors.foreground }]}>
                  {t("changePassword")}
                </Text>
                <Text style={[styles.cpSubtitle, { color: colors.mutedForeground }]}>
                  {t("changePasswordSubtitle")}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.cpCloseBtn}>
                <Icon name="close" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Current Password */}
            <View style={[styles.cpField, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Icon name="lock" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.cpInput, { color: colors.foreground }]}
                placeholder={t("currentPassword")}
                placeholderTextColor={colors.mutedForeground}
                value={currentPwd}
                onChangeText={(v) => { setCurrentPwd(v); setError(""); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            {/* New Password */}
            <View style={[styles.cpField, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Icon name="lock" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.cpInput, { color: colors.foreground }]}
                placeholder={t("newPassword")}
                placeholderTextColor={colors.mutedForeground}
                value={newPwd}
                onChangeText={(v) => { setNewPwd(v); setError(""); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            {/* Confirm New Password */}
            <View style={[styles.cpField, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Icon name="shield-check" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.cpInput, { color: colors.foreground }]}
                placeholder={t("confirmNewPassword")}
                placeholderTextColor={colors.mutedForeground}
                value={confirmPwd}
                onChangeText={(v) => { setConfirmPwd(v); setError(""); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {/* Inline error */}
            {!!error && (
              <View style={styles.cpErrorRow}>
                <Icon name="alert-circle" size={14} color="#DC2626" />
                <Text style={styles.cpErrorText}>{error}</Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.cpSubmitBtn,
                { backgroundColor: colors.primary },
                loading && { opacity: 0.7 },
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.cpSubmitText}>{t("changePassword")}</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Delete Account Modal ───────────────────────────────────────────────────
interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onDelete: (password: string) => Promise<void>;
}

function DeleteAccountModal({ visible, onClose, onDelete }: DeleteAccountModalProps) {
  const colors = useColors();
  const { t } = useT();

  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const reset = () => {
    setPassword("");
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError("");
    if (!password.trim()) {
      setError(t("deleteOwnAccountPassword"));
      return;
    }
    setLoading(true);
    try {
      await onDelete(password);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError(t("wrongPassword"));
      } else {
        setError(err.message ?? t("errGeneric"));
      }
      setLoading(false);
    }
  };

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.cpOverlay} onPress={handleClose}>
          <Pressable style={[styles.cpSheet, { backgroundColor: colors.card }]}>
            <View style={styles.cpHandle} />
            <View style={styles.cpHeader}>
              <View style={[styles.cpIconWrap, { backgroundColor: "#DC262615" }]}>
                <Icon name="trash" size={20} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cpTitle, { color: "#DC2626" }]}>
                  {t("deleteOwnAccountConfirmTitle")}
                </Text>
                <Text style={[styles.cpSubtitle, { color: colors.mutedForeground }]}>
                  {t("deleteOwnAccountConfirmMsg")}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.cpCloseBtn}>
                <Icon name="close" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={[styles.cpField, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Icon name="lock" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.cpInput, { color: colors.foreground }]}
                placeholder={t("deleteOwnAccountPassword")}
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(""); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {!!error && (
              <View style={styles.cpErrorRow}>
                <Icon name="alert-circle" size={14} color="#DC2626" />
                <Text style={styles.cpErrorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.cpSubmitBtn,
                { backgroundColor: "#DC2626" },
                loading && { opacity: 0.7 },
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.cpSubmitText}>{t("deleteOwnAccount")}</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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

// ── Request Change Modal ───────────────────────────────────────────────────
// Module-level to keep stable identity across renders (preserves TextInput focus).
interface RequestChangeModalProps {
  visible: boolean;
  field: "phone" | "employeeNumber";
  value: string;
  loading: boolean;
  error: string;
  onChangeValue: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function RequestChangeModal({
  visible,
  field,
  value,
  loading,
  error,
  onChangeValue,
  onSubmit,
  onClose,
}: RequestChangeModalProps) {
  const colors = useColors();
  const { t } = useT();
  const labelKey = field === "phone" ? "newPhoneValue" : "newEmpValue";
  const titleKey = field === "phone" ? "requestPhoneChange" : "requestEmpChange";
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.cpOverlay} onPress={onClose}>
          <Pressable style={[styles.cpSheet, { backgroundColor: colors.card }]}>
            <View style={styles.cpHandle} />
            <View style={styles.cpHeader}>
              <View style={[styles.cpIconWrap, { backgroundColor: colors.secondary + "18" }]}>
                <Icon name={field === "phone" ? "phone" : "tag"} size={20} color={colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cpTitle, { color: colors.foreground }]}>{t(titleKey)}</Text>
                <Text style={[styles.cpSubtitle, { color: colors.mutedForeground }]}>
                  {t("changeRequestSubmitted").slice(0, 40)}…
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.cpCloseBtn}>
                <Icon name="close" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={[styles.cpField, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Icon name={field === "phone" ? "phone" : "tag"} size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.cpInput, { color: colors.foreground }]}
                placeholder={t(labelKey)}
                placeholderTextColor={colors.mutedForeground}
                value={value}
                onChangeText={onChangeValue}
                keyboardType={field === "phone" ? "phone-pad" : "default"}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={onSubmit}
                autoFocus
              />
            </View>
            {!!error && (
              <View style={styles.cpErrorRow}>
                <Icon name="alert-circle" size={14} color="#DC2626" />
                <Text style={styles.cpErrorText}>{error}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.cpSubmitBtn, { backgroundColor: colors.secondary }, loading && { opacity: 0.7 }]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.cpSubmitText}>{t("submitChangeRequest")}</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── My Change Request Card ─────────────────────────────────────────────────
interface MyChangeRequestCardProps {
  req: ProfileChangeRequest;
}

function MyChangeRequestCard({ req }: MyChangeRequestCardProps) {
  const colors = useColors();
  const { t } = useT();
  const STATUS_COLOR: Record<string, string> = {
    pending: "#D97706",
    approved: "#16A34A",
    rejected: "#DC2626",
    cancelled: "#6B7280",
  };
  const statusLabel = (s: string) => {
    if (s === "pending") return t("pendingStatus");
    if (s === "approved") return t("approvedStatus");
    if (s === "rejected") return t("rejectedStatus");
    return t("cancelledStatus");
  };
  const color = STATUS_COLOR[req.status] || "#6B7280";
  return (
    <View style={[styles.changeReqCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.changeReqTopRow}>
        <View style={[styles.fieldPill, { backgroundColor: colors.primary + "15" }]}>
          <Icon name={req.field === "phone" ? "phone" : "tag"} size={11} color={colors.primary} />
          <Text style={[styles.fieldPillText, { color: colors.primary }]}>
            {req.field === "phone" ? t("phoneField") : t("employeeNumberField")}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: color + "18" }]}>
          <Text style={[styles.statusPillText, { color }]}>{statusLabel(req.status)}</Text>
        </View>
      </View>
      <Text style={[styles.changeReqValues, { color: colors.mutedForeground }]}>
        {req.currentValue} → {req.requestedValue}
      </Text>
      {!!req.adminReason && (
        <View style={styles.adminReasonRow}>
          <Icon name="alert-circle" size={12} color="#DC2626" />
          <Text style={[styles.adminReasonText, { color: "#DC2626" }]}>{req.adminReason}</Text>
        </View>
      )}
    </View>
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
    changePassword,
    requestProfileChange,
    deleteOwnAccount,
  } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [department, setDepartment] = useState(profile?.department || "");

  // ── Profile change request modal ─────────────────────────────────────────
  const [requestModal, setRequestModal] = useState<{
    visible: boolean;
    field: "phone" | "employeeNumber";
    value: string;
    loading: boolean;
    error: string;
  }>({ visible: false, field: "phone", value: "", loading: false, error: "" });

  // ── Own profile change requests (real-time) ──────────────────────────────
  const [myChangeRequests, setMyChangeRequests] = useState<ProfileChangeRequest[]>([]);
  React.useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "profile_change_requests"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMyChangeRequests(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProfileChangeRequest, "id">) }))
      );
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const openRequestModal = (field: "phone" | "employeeNumber") => {
    setRequestModal({ visible: true, field, value: "", loading: false, error: "" });
  };

  const handleSubmitRequest = async () => {
    const { field, value } = requestModal;
    setRequestModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      await requestProfileChange(field, value);
      setRequestModal({ visible: false, field: "phone", value: "", loading: false, error: "" });
      Alert.alert(t("success"), t("changeRequestSubmitted"));
    } catch (e: unknown) {
      const msg = (e as Error)?.message;
      let errorMsg = msg || t("error");
      if (msg === "value_required") errorMsg = t("valueRequired");
      else if (msg === "value_unchanged") errorMsg = t("valueUnchanged");
      setRequestModal((prev) => ({ ...prev, loading: false, error: errorMsg }));
    }
  };

  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const handleDeleteOwnAccount = async (password: string) => {
    await deleteOwnAccount(password);
    setShowDeleteAccountModal(false);
    router.replace("/auth/login" as never);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserProfile({ displayName, department });
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
          {/* Phone — read-only, change via request */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <View style={styles.fieldIcon}>
              <Icon name="phone" size={16} color={colors.mutedForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("phone")}</Text>
              <Text style={[styles.fieldInput, { color: colors.foreground }]}>
                {profile?.phone || "—"}
              </Text>
            </View>
            {!isSuperAdmin && (
              <TouchableOpacity
                style={[styles.requestChangeBtn, { borderColor: colors.secondary }]}
                onPress={() => openRequestModal("phone")}
              >
                <Text style={[styles.requestChangeBtnText, { color: colors.secondary }]}>
                  {t("requestChange")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Employee Number — read-only, change via request */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <View style={styles.fieldIcon}>
              <Icon name="tag" size={16} color={colors.mutedForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("employeeNumber")}</Text>
              <Text style={[styles.fieldInput, { color: colors.foreground }]}>
                {profile?.employeeNumber || "—"}
              </Text>
            </View>
            {!isSuperAdmin && (
              <TouchableOpacity
                style={[styles.requestChangeBtn, { borderColor: colors.secondary }]}
                onPress={() => openRequestModal("employeeNumber")}
              >
                <Text style={[styles.requestChangeBtnText, { color: colors.secondary }]}>
                  {t("requestChange")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

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

        {/* My Change Requests — visible to all non-super-admin users */}
        {!isSuperAdmin && myChangeRequests.length > 0 && (
          <>
            <SectionHeader title={t("myChangeRequests")} />
            <View style={{ gap: 8, paddingHorizontal: 16 }}>
              {myChangeRequests.map((req) => (
                <MyChangeRequestCard key={req.id} req={req} />
              ))}
            </View>
          </>
        )}

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

        {/* Security — visible to all users */}
        <SectionHeader title={t("security")} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <AdminActionRow
            icon="lock"
            label={t("changePassword")}
            subtitle={t("changePasswordSubtitle")}
            onPress={() => setShowChangePasswordModal(true)}
          />
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
              <AdminActionRow
                icon="person"
                label={t("profileChangeRequests")}
                subtitle={t("profileChangesSubtitle")}
                onPress={() => router.push("/admin/profile-changes" as never)}
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
                label={t("deleteOwnAccount")}
                subtitle={t("deleteOwnAccountDesc")}
                onPress={() => setShowDeleteAccountModal(true)}
                destructive
                showArrow={false}
              />
            </View>
          </>
        )}

        {/* Legal & Privacy */}
        <SectionHeader title={t("legalAndPrivacy")} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <AdminActionRow
            icon="info-circle"
            label={t("privacyPolicy")}
            onPress={() => router.push({ pathname: "/legal/[page]", params: { page: "privacy-policy" } } as never)}
          />
          <AdminActionRow
            icon="info-circle"
            label={t("termsOfUse")}
            onPress={() => router.push({ pathname: "/legal/[page]", params: { page: "terms-of-use" } } as never)}
          />
          <AdminActionRow
            icon="info-circle"
            label={t("accountDeletionPolicy")}
            onPress={() => router.push({ pathname: "/legal/[page]", params: { page: "account-deletion-policy" } } as never)}
          />
          <AdminActionRow
            icon="info-circle"
            label={t("dataRetentionPolicy")}
            onPress={() => router.push({ pathname: "/legal/[page]", params: { page: "data-retention-policy" } } as never)}
          />
          <AdminActionRow
            icon="info-circle"
            label={t("contactSupport")}
            onPress={() => router.push({ pathname: "/legal/[page]", params: { page: "contact-support" } } as never)}
          />
        </View>

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
            disabled={loggingOut}
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

      {/* Delete Account Modal */}
      <DeleteAccountModal
        visible={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        onDelete={handleDeleteOwnAccount}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        visible={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        onChangePassword={changePassword}
      />

      {/* Request Profile Change Modal */}
      <RequestChangeModal
        visible={requestModal.visible}
        field={requestModal.field}
        value={requestModal.value}
        loading={requestModal.loading}
        error={requestModal.error}
        onChangeValue={(v) => setRequestModal((prev) => ({ ...prev, value: v }))}
        onSubmit={handleSubmitRequest}
        onClose={() =>
          setRequestModal({ visible: false, field: "phone", value: "", loading: false, error: "" })
        }
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

  // Change Password Modal
  cpOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  cpSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 20,
  },
  cpHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignSelf: "center",
    marginBottom: 4,
  },
  cpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cpIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cpTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  cpSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  cpCloseBtn: {
    padding: 6,
  },
  cpField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cpInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 2,
  },
  cpErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cpErrorText: {
    color: "#DC2626",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  cpSubmitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  cpSubmitText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },

  // Request Change button (inside read-only field rows)
  requestChangeBtn: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginLeft: 8,
    flexShrink: 0,
  },
  requestChangeBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },

  // My Change Request Cards
  changeReqCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  changeReqTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  changeReqValues: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  adminReasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginTop: 2,
  },
  adminReasonText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  fieldPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  fieldPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
