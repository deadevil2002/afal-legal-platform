import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { useDialog } from "@/context/DialogContext";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useProcurementRequests } from "@/context/ProcurementRequestsContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

// ─── RFQ Icon Badge ───────────────────────────────────────────────────────────

function RFQIconBadge() {
  return (
    <View style={rfqStyles.badge}>
      <View style={rfqStyles.inner}>
        <Text style={rfqStyles.rfqText}>RFQ</Text>
        <View style={rfqStyles.lines}>
          <View style={rfqStyles.line} />
          <View style={rfqStyles.line} />
          <View style={[rfqStyles.line, { width: "60%" }]} />
        </View>
      </View>
    </View>
  );
}

const rfqStyles = StyleSheet.create({
  badge: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#2D6491",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  inner: { alignItems: "center", gap: 3 },
  rfqText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  lines: { gap: 2, width: 26 },
  line: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 1,
    width: "100%",
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NewProcurementRequestScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { user, profile, isAdmin } = useAuth();
  const { createRFQ } = useProcurementRequests();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showError, showDialog } = useDialog();

  const canCreate = profile?.canSubmitRequests === true || isAdmin;

  const [title, setTitle] = useState("");
  const [groupOrRequesterName, setGroupOrRequesterName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [attachmentMetas, setAttachmentMetas] = useState<AttachmentMeta[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      showError(t("rfqTitleRequired"), t("error"));
      return;
    }
    if (!productDescription.trim()) {
      showError(t("rfqDescriptionRequired"), t("error"));
      return;
    }
    if (!profile) return;

    setSubmitting(true);
    try {
      const id = await createRFQ({
        title,
        groupOrRequesterName,
        productDescription,
        attachments: attachmentMetas.map((a) => ({
          name: a.fileName,
          url: a.fileUrl,
          type: a.fileType,
          size: a.size,
          uploadedAt: new Date().toISOString(),
          uploadedByUid: user?.uid ?? "",
        })),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showDialog({
        title: t("success"),
        message: t("rfqCreatedSuccess"),
        type: "success",
        buttons: [{ text: t("ok"), onPress: () => router.replace(`/procurement/${id}` as never) }],
      });
    } catch (e: unknown) {
      console.error("[NewProcurement] submit error:", (e as Error).message);
      showError(t("errSubmit"), t("error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (profile === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!canCreate) {
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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t("newProcurementRequest")}
          </Text>
          <View style={{ width: 72 }} />
        </View>
        <View style={styles.deniedContainer}>
          <Icon name="lock" size={52} color="#CBD5E1" />
          <Text style={[styles.deniedTitle, { color: colors.foreground }]}>
            {t("noSubmitPermission")}
          </Text>
          <Text style={[styles.deniedDesc, { color: colors.mutedForeground }]}>
            {t("noSubmitPermissionDesc")}
          </Text>
          <TouchableOpacity
            style={[styles.backHomeBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/(tabs)/procurement" as never)}
          >
            <Text style={styles.backHomeBtnText}>{t("back")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} disabled={submitting}>
          <Icon name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t("newProcurementRequest")}
        </Text>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>{t("submitRFQ")}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Card 1: RFQ Title */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.cardHeader, isRTL && styles.rowRTL]}>
            <RFQIconBadge />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              {t("rfqHeaderLabel")}
              <Text style={{ color: colors.destructive }}> *</Text>
            </Text>
          </View>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder={t("rfqTitlePlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="sentences"
            textAlign={isRTL ? "right" : "left"}
            editable={!submitting}
          />
        </View>

        {/* Card 2: Group / Requester */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.fieldHeader, isRTL && styles.rowRTL]}>
            <Icon name="person" size={16} color={colors.primary} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              {t("rfqGroupOrRequester")}
            </Text>
          </View>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={groupOrRequesterName}
            onChangeText={setGroupOrRequesterName}
            placeholder={profile.displayName}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            textAlign={isRTL ? "right" : "left"}
            editable={!submitting}
          />
        </View>

        {/* Card 3: Product Description */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.fieldHeader, isRTL && styles.rowRTL]}>
            <Icon name="file-doc" size={16} color={colors.primary} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              {t("rfqDetailsSection")}
              <Text style={{ color: colors.destructive }}> *</Text>
            </Text>
          </View>
          <TextInput
            style={[
              styles.textarea,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            value={productDescription}
            onChangeText={setProductDescription}
            placeholder={t("rfqProductDescriptionPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
            autoCapitalize="sentences"
            textAlign={isRTL ? "right" : "left"}
            editable={!submitting}
          />
        </View>

        {/* Card 4: Attachments */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.fieldHeader, isRTL && styles.rowRTL]}>
            <Icon name="paperclip" size={16} color={colors.primary} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              {t("rfqAttachments")}
            </Text>
          </View>
          <AttachmentPicker
            attachments={attachmentMetas}
            onChange={setAttachmentMetas}
            uploadContext={{ type: "request" }}
            maxFiles={5}
            disabled={submitting}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    justifyContent: "space-between",
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center",
  },
  submitBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: "center",
  },
  submitBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  scroll: { padding: 16, gap: 14 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  rowRTL: { flexDirection: "row-reverse" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 160,
  },
  deniedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  deniedTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginTop: 8,
  },
  deniedDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  backHomeBtn: {
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  backHomeBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
