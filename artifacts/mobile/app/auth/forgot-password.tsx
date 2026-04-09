import { sendPasswordResetEmail } from "firebase/auth";
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
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { auth } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert(t("error"), t("required"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert(t("error"), t("invalidEmail"));
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setSent(true);
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message || t("error");
      Alert.alert(t("error"), msg);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40),
              paddingBottom: insets.bottom + 40,
            },
          ]}
        >
          <View style={styles.logoContainer}>
            <Logo size="large" />
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.successIcon}>
              <Icon name="mail" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.heading, { color: colors.primary }, isRTL && styles.textRTL]}>
              Check Your Email
            </Text>
            <Text style={[styles.desc, { color: colors.mutedForeground }, isRTL && styles.textRTL]}>
              A password reset link has been sent to{"\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                {email.trim().toLowerCase()}
              </Text>
              {"\n\n"}Check your inbox and follow the instructions to reset your password.
            </Text>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={() => router.back()}
            >
              <Text style={styles.btnText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40),
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Logo size="large" />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
            <Icon name="arrow-left" size={16} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>Back to Sign In</Text>
          </TouchableOpacity>

          <Text style={[styles.heading, { color: colors.primary }, isRTL && styles.textRTL]}>
            Forgot Password
          </Text>
          <Text style={[styles.desc, { color: colors.mutedForeground }, isRTL && styles.textRTL]}>
            Enter your registered email address and we'll send you a link to reset your password.
          </Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("email")}
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}><Icon name="mail" size={16} color={colors.mutedForeground} /></View>
              <TextInput
                style={[styles.input, { color: colors.foreground }, isRTL && styles.textRTL]}
                value={email}
                onChangeText={setEmail}
                placeholder={t("email")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
            onPress={handleReset}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, flexGrow: 1 },
  logoContainer: { alignItems: "center", marginBottom: 32 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  backText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  successIcon: { alignItems: "center", marginBottom: 16 },
  heading: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8 },
  desc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 24,
    textAlign: "left",
  },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  icon: { marginRight: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  btn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  textRTL: { textAlign: "right" },
});
