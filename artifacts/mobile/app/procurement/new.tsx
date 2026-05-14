import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

export default function NewProcurementRequestScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { user, profile, isAdmin } = useAuth();
  const { createRFQ } = useProcurementRequests();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const canCreate = profile?.canSubmitRequests === true || isAdmin;

  const [title, setTitle] = useState("");
  const [groupOrRequesterName, setGroupOrRequesterName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [attachmentMetas, setAttachmentMetas] = useState<AttachmentMeta[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert(t("error"), t("rfqTitleRequired"));
      return;
    }
    if (!productDescription.trim()) {
      Alert.alert(t("error"), t("rfqDescriptionRequired"));
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
      Alert.alert(t("success"), t("rfqCreatedSuccess"), [
        {
          text: t("ok"),
          onPress: () => router.replace(`/procurement/${id}` as never),
        },
      ]);
    } catch (e: unknown) {
      console.error("[NewProcurement] submit error:", (e as Error).message);
      Alert.alert(t("error"), t("errSubmit"));
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
        {/* RFQ Title */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          {t("rfqTitle").toUpperCase()} *
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
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

        {/* Group / Requester Name */}
        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 24 }]}>
          {t("rfqGroupOrRequester").toUpperCase()}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
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
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {t("rfqGroupOrRequesterPlaceholder")}
        </Text>

        {/* Product / Service Description */}
        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 24 }]}>
          {t("rfqProductDescription").toUpperCase()} *
        </Text>
        <TextInput
          style={[
            styles.textarea,
            {
              backgroundColor: colors.card,
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

        {/* Attachments */}
        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 24 }]}>
          {t("rfqAttachments").toUpperCase()}
        </Text>
        <AttachmentPicker
          attachments={attachmentMetas}
          onChange={setAttachmentMetas}
          uploadContext={{ type: "request" }}
          maxFiles={5}
          disabled={submitting}
        />
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
  scroll: { padding: 20 },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    lineHeight: 17,
  },
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
