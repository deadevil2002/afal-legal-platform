import { useRouter } from "expo-router";
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
import { Icon } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export default function TransferSuperAdminScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { isSuperAdmin, transferSuperAdmin } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [targetEmail, setTargetEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!isSuperAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="lock" size={48} color={colors.border} />
        <Text style={[styles.denied, { color: colors.foreground }]}>Access Denied</Text>
      </View>
    );
  }

  const handleTransfer = () => {
    const emailTrimmed = targetEmail.trim().toLowerCase();
    if (!emailTrimmed) {
      Alert.alert(t("error"), t("required"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      Alert.alert(t("error"), t("invalidEmail"));
      return;
    }
    if (!password) {
      Alert.alert(t("error"), t("required"));
      return;
    }

    Alert.alert(
      t("transferConfirmTitle"),
      t("transferConfirmMessage"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("confirm"),
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await transferSuperAdmin(emailTrimmed, password);
              setDone(true);
            } catch (e: unknown) {
              Alert.alert(t("error"), (e as { message?: string }).message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  if (done) {
    return (
      <View style={[styles.successScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.successIcon, { backgroundColor: "#16A34A15" }]}>
            <Icon name="check-circle" size={48} color="#16A34A" />
          </View>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>
            Transfer Complete
          </Text>
          <Text style={[styles.successDesc, { color: colors.mutedForeground }]}>
            {t("transferSuccess")}
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/(tabs)/settings" as never)}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: "#0C233C",
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("transferSuperAdmin")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Warning Banner */}
        <View style={[styles.warningBox, { borderColor: "#DC2626", backgroundColor: "#DC262610" }]}>
          <Icon name="warning" size={18} color="#DC2626" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.warningTitle, { color: "#DC2626" }]}>
              {t("transferWarning")}
            </Text>
            <Text style={[styles.warningDesc, { color: colors.foreground }]}>
              {t("transferSuperAdminDesc")}
            </Text>
          </View>
        </View>

        {/* Audit Note */}
        <View style={[styles.auditBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Icon name="shield-check" size={14} color={colors.secondary} />
          <Text style={[styles.auditText, { color: colors.mutedForeground }]}>
            This transfer is permanently recorded in the audit log with timestamp, your identity, and the new Super Admin's details.
          </Text>
        </View>

        {/* Form */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          {t("transferTargetEmail").toUpperCase()}
        </Text>
        <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.inputIcon}><Icon name="mail" size={16} color={colors.mutedForeground} /></View>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder={t("transferTargetEmailPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            value={targetEmail}
            onChangeText={setTargetEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textAlign={isRTL ? "right" : "left"}
            editable={!loading}
          />
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>
          {t("transferPasswordConfirm").toUpperCase()}
        </Text>
        <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.inputIcon}><Icon name="lock" size={16} color={colors.mutedForeground} /></View>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder={t("transferPasswordPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            textAlign={isRTL ? "right" : "left"}
            editable={!loading}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Icon name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Password confirmation is required to prevent unauthorized transfers. The target user must already have a registered account.
        </Text>

        <TouchableOpacity
          style={[
            styles.transferBtn,
            { backgroundColor: "#DC2626" },
            (loading || !targetEmail || !password) && { opacity: 0.5 },
          ]}
          onPress={handleTransfer}
          disabled={loading || !targetEmail || !password}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Icon name="refresh" size={16} color="#fff" />
              <Text style={styles.transferBtnText}>{t("transferSuperAdmin")}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: colors.border }]}
          onPress={() => router.back()}
          disabled={loading}
        >
          <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>{t("cancel")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  denied: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  scroll: { padding: 20 },
  warningBox: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  warningTitle: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 4 },
  warningDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  auditBox: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    alignItems: "flex-start",
  },
  auditText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 10,
  },
  eyeBtn: { padding: 6 },
  hint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 10,
    marginBottom: 28,
  },
  transferBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 12,
  },
  transferBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  successScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  successCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  successIcon: { borderRadius: 50, padding: 16, marginBottom: 4 },
  successTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  successDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  doneBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  doneBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
