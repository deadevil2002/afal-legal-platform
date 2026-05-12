import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { Icon } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { useProcurementRequests } from "@/context/ProcurementRequestsContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export default function NewProcurementRequestScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { profile, isAdmin } = useAuth();
  const { createRFQ } = useProcurementRequests();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const canCreate = profile?.canSubmitRequests === true || isAdmin;

  // Redirect users who cannot create procurement requests
  useEffect(() => {
    if (profile !== null && !canCreate) {
      router.replace("/(tabs)/procurement" as never);
    }
  }, [canCreate, profile, router]);

  const [title, setTitle] = useState("");
  const [groupOrRequesterName, setGroupOrRequesterName] = useState("");
  const [productDescription, setProductDescription] = useState("");
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
});
