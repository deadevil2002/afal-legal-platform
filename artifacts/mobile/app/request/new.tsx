import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import React, { useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
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

const CATEGORY_KEYS: Record<RequestCategory, "typeAmicable" | "typeComplaint" | "typeLegalConsultation" | "typeInvestigation" | "typeContractIssue" | "typeViolationReport"> = {
  "Amicable Settlement":  "typeAmicable",
  "Complaint":            "typeComplaint",
  "Legal Consultation":   "typeLegalConsultation",
  "Investigation Request":"typeInvestigation",
  "Contract Issue":       "typeContractIssue",
  "Violation Report":     "typeViolationReport",
};

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

const PRIORITY_KEYS: Record<Priority, "priorityLow" | "priorityMedium" | "priorityHigh" | "priorityUrgent"> = {
  low: "priorityLow",
  medium: "priorityMedium",
  high: "priorityHigh",
  urgent: "priorityUrgent",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#6B7280",
  medium: "#D97706",
  high: "#DC2626",
  urgent: "#7C3AED",
};

export default function NewRequestScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { user, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<RequestCategory>("Legal Consultation");
  const [priority, setPriority] = useState<Priority>("medium");
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert(t("error"), t("required"));
      return;
    }
    if (!user || !profile) return;
    setLoading(true);
    try {
      const now = serverTimestamp();
      await addDoc(collection(db, "requests"), {
        title: title.trim(),
        description: description.trim(),
        category,
        type: category,
        priority,
        status: "Submitted",
        userId: user.uid,
        createdBy: user.uid,
        createdByName: profile.displayName,
        createdByEmployeeNumber: profile.employeeNumber || "",
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
        viewedBy: { [user.uid]: true },
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(t("success"), t("requestCreated"), [
        { text: t("ok"), onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      console.error("[NewRequest] Submit error:", (e as Error).message);
      Alert.alert(t("error"), t("errSubmit"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          <Icon name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("newRequest")}</Text>
        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>{t("submitRequest")}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          {t("requestTitle").toUpperCase()} *
        </Text>
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
        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 20 }]}>
          {t("requestType").toUpperCase()}
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
                {t(CATEGORY_KEYS[cat])}
              </Text>
              {category === cat && (
                <Icon name="check" size={12} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Priority */}
        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 20 }]}>
          {t("requestPriority").toUpperCase()}
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
                {t(PRIORITY_KEYS[p])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description */}
        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 20 }]}>
          {t("requestDescription").toUpperCase()} *
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
        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 20 }]}>
          {t("attachmentsLabel")}
        </Text>
        <AttachmentPicker
          attachments={attachments}
          onChange={setAttachments}
          uploadContext={{ type: "request" }}
          maxFiles={5}
          disabled={loading}
        />

        <TouchableOpacity
          style={[
            styles.mainSubmitBtn,
            { backgroundColor: colors.primary },
            loading && { opacity: 0.7 },
          ]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="send" size={16} color="#fff" />
              <Text style={styles.mainSubmitText}>{t("submitRequest")}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  submitBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  submitBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  scroll: { padding: 20 },
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
  mainSubmitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    borderRadius: 12,
    paddingVertical: 15,
  },
  mainSubmitText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
