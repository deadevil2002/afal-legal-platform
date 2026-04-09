import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AttachmentMeta, AttachmentPicker } from "@/components/AttachmentPicker";
import { Icon } from "@/components/Icon";
import { useAuth, UserProfile } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

const REQUEST_CATEGORIES = [
  "Amicable Settlement",
  "Complaint",
  "Legal Consultation",
  "Investigation Request",
  "Contract Issue",
  "Violation Report",
] as const;

type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#6B7280",
  medium: "#D97706",
  high: "#DC2626",
  urgent: "#7C3AED",
};

export default function SendToEmployeeScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { user, profile, isAdmin, getAllUsers } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<UserProfile | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<RequestCategory>("Legal Consultation");
  const [priority, setPriority] = useState<Priority>("medium");
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAllUsers()
      .then((all) => setUsers(all.filter((u) => u.role === "user")))
      .catch(() => Alert.alert(t("error"), t("failedToLoadEmployees")))
      .finally(() => setLoadingUsers(false));
  }, []);

  if (!isAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="lock" size={48} color={colors.border} />
        <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 12 }}>
          {t("adminRequired")}
        </Text>
      </View>
    );
  }

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      (u.employeeNumber?.toLowerCase() || "").includes(q) ||
      (u.department?.toLowerCase() || "").includes(q)
    );
  });

  const handleSubmit = async () => {
    if (!selectedEmployee) {
      Alert.alert(t("error"), t("selectEmployeeFirst"));
      return;
    }
    if (!title.trim() || !description.trim()) {
      Alert.alert(t("error"), t("titleDescRequired"));
      return;
    }
    if (!user || !profile) return;

    setSubmitting(true);
    try {
      const now = serverTimestamp();
      await addDoc(collection(db, "requests"), {
        title: title.trim(),
        description: description.trim(),
        category,
        type: category,
        priority,
        status: "Submitted",
        userId: selectedEmployee.uid,
        createdBy: user.uid,
        createdByName: profile.displayName,
        createdByAdmin: true,
        createdByAdminUid: user.uid,
        targetEmployeeUid: selectedEmployee.uid,
        targetEmployeeName: selectedEmployee.displayName,
        targetEmployeeNumber: selectedEmployee.employeeNumber || "",
        targetEmployeeDepartment: selectedEmployee.department || "",
        concernedParties: "",
        attachments: attachments.map((a) => ({
          fileUrl: a.fileUrl,
          publicId: a.publicId,
          fileName: a.fileName,
          fileType: a.fileType,
          size: a.size,
          resourceType: a.resourceType,
          folder: a.folder,
          uploadedByUid: user.uid,
        })),
        createdAt: now,
        updatedAt: now,
        statusChangedAt: now,
        statusChangedBy: null,
        closedAt: null,
        closedBy: null,
        messageCount: 0,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t("success"), `${t("requestSentTo")} ${selectedEmployee.displayName}.`, [
        { text: t("ok"), onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      console.error("[SendToEmployee] Submit error:", (e as Error).message);
      Alert.alert(t("error"), t("errSubmit"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: "#112B4D",
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("sendToEmployee")}</Text>
          <Text style={styles.headerSub}>{t("sendToEmployeeDesc")}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step 1: Select Employee */}
        <View style={styles.stepHeader}>
          <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.stepNum}>1</Text>
          </View>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t("selectEmployee")}</Text>
        </View>

        {selectedEmployee ? (
          <View style={[styles.selectedCard, { backgroundColor: colors.card, borderColor: colors.secondary }]}>
            <View style={[styles.empAvatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.empAvatarText}>
                {selectedEmployee.displayName?.charAt(0)?.toUpperCase() || "?"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.empName, { color: colors.foreground }]}>
                {selectedEmployee.displayName}
              </Text>
              <Text style={[styles.empEmail, { color: colors.mutedForeground }]}>
                {selectedEmployee.email}
              </Text>
              {!!selectedEmployee.employeeNumber && (
                <Text style={[styles.empNum, { color: colors.secondary }]}>
                  #{selectedEmployee.employeeNumber}
                </Text>
              )}
              {!!selectedEmployee.department && (
                <Text style={[styles.empDept, { color: colors.mutedForeground }]}>
                  {selectedEmployee.department}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setSelectedEmployee(null)}>
              <Icon name="x-circle" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.searchBar,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Icon name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t("searchEmployee")}
                placeholderTextColor={colors.mutedForeground}
                autoCorrect={false}
                textAlign={isRTL ? "right" : "left"}
              />
            </View>

            {loadingUsers ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : filteredUsers.length === 0 ? (
              <View style={styles.emptySearch}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {searchQuery ? t("noEmployeesFound") : t("noUsersFound")}
                </Text>
              </View>
            ) : (
              <View style={styles.userList}>
                {filteredUsers.slice(0, 20).map((u) => (
                  <TouchableOpacity
                    key={u.uid}
                    style={[
                      styles.userRow,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                    onPress={() => {
                      setSelectedEmployee(u);
                      setSearchQuery("");
                    }}
                  >
                    <View style={[styles.empAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.empAvatarText}>
                        {u.displayName?.charAt(0)?.toUpperCase() || "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.empName, { color: colors.foreground }]} numberOfLines={1}>
                        {u.displayName}
                      </Text>
                      {!!u.employeeNumber && (
                        <Text style={[styles.empNum, { color: colors.secondary }]}>
                          #{u.employeeNumber}
                        </Text>
                      )}
                      {!!u.department && (
                        <Text style={[styles.empDept, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {u.department}
                        </Text>
                      )}
                    </View>
                    <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* Step 2: Request Details (only show once employee selected) */}
        {selectedEmployee && (
          <>
            <View style={[styles.stepHeader, { marginTop: 24 }]}>
              <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.stepNum}>2</Text>
              </View>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t("requestDetails")}</Text>
            </View>

            {/* Title */}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{t("titleLabel")}</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
              value={title}
              onChangeText={setTitle}
              placeholder={t("titlePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="sentences"
              textAlign={isRTL ? "right" : "left"}
            />

            {/* Category */}
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>
              {t("categoryLabel")}
            </Text>
            <View style={styles.chipGrid}>
              {REQUEST_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.chip,
                    {
                      borderColor: category === cat ? colors.primary : colors.border,
                      backgroundColor: category === cat ? colors.primary + "15" : colors.card,
                    },
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: category === cat ? colors.primary : colors.foreground },
                    ]}
                  >
                    {cat}
                  </Text>
                  {category === cat && <Icon name="check" size={12} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Priority */}
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>
              {t("priorityLabel")}
            </Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityChip,
                    {
                      borderColor: priority === p ? PRIORITY_COLORS[p] : colors.border,
                      backgroundColor: priority === p ? PRIORITY_COLORS[p] + "15" : colors.card,
                    },
                  ]}
                  onPress={() => setPriority(p)}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      { color: priority === p ? PRIORITY_COLORS[p] : colors.mutedForeground },
                    ]}
                  >
                    {t(`priority${p.charAt(0).toUpperCase() + p.slice(1)}` as import("@/i18n/translations").TranslationKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>
              {t("descriptionLabel")}
            </Text>
            <TextInput
              style={[
                styles.textarea,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder={t("descPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
              textAlign={isRTL ? "right" : "left"}
            />

            {/* Attachments */}
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>
              {t("attachmentsLabel")}
            </Text>
            <AttachmentPicker
              attachments={attachments}
              onChange={setAttachments}
              uploadContext={{ type: "request" }}
              maxFiles={5}
              disabled={submitting}
            />

            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: colors.primary },
                submitting && { opacity: 0.7 },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="send-to-employee" size={18} color="#fff" />
                  <Text style={styles.submitText}>{t("sendToEmployee")}</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  scroll: { padding: 16 },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  stepTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  empAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  empAvatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  empName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  empEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  empNum: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  empDept: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  emptySearch: { alignItems: "center", marginTop: 24 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  userList: { gap: 8 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  chipGrid: { gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  chipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  priorityRow: { flexDirection: "row", gap: 8 },
  priorityChip: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
  priorityText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  textarea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 120,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    borderRadius: 12,
    paddingVertical: 15,
  },
  submitText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
