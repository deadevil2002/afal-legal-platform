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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export default function LoginScreen() {
  const colors = useColors();
  const { t, isRTL } = useT();
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t("error"), t("required"));
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)/" as never);
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message || t("error");
      Alert.alert(t("error"), msg);
    } finally {
      setLoading(false);
    }
  };

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
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 40),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Logo size="large" />
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>{t("tagline")}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.heading, { color: colors.primary }, isRTL && styles.textRTL]}>
            {t("login")}
          </Text>

          {/* Email Field */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("email")}
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}>
                <Icon name="mail" size={16} color={colors.mutedForeground} />
              </View>
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

          {/* Password Field */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("password")}
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}>
                <Icon name="lock" size={16} color={colors.mutedForeground} />
              </View>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={password}
                onChangeText={setPassword}
                placeholder={t("password")}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.forgotRow, isRTL && styles.forgotRowRTL]}
              onPress={() => router.push("/auth/forgot-password" as never)}
            >
              <Text style={[styles.forgotLink, { color: colors.primary }]}>
                {t("forgotPassword")}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>{t("signIn")}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchBtn}
            onPress={() => router.push("/auth/register" as never)}
          >
            <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
              {t("noAccount")}{" "}
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                {t("signUp")}
              </Text>
            </Text>
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
  tagline: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },
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
  heading: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 24 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  forgotRow: { alignSelf: "flex-end", marginTop: 8 },
  forgotRowRTL: { alignSelf: "flex-start" },
  forgotLink: { fontSize: 12, fontFamily: "Inter_500Medium" },
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
  switchBtn: { marginTop: 16, alignItems: "center" },
  switchText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  textRTL: { textAlign: "right" },
});
