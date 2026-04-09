import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
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
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { mapFirebaseAuthError } from "@/lib/firebaseErrorMapper";

export default function RegisterScreen() {
  const colors = useColors();
  const { t, isRTL, language } = useT();
  const { register } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const empNumRef = useRef<TextInput>(null);
  const deptRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const pwRef = useRef<TextInput>(null);
  const confirmPwRef = useRef<TextInput>(null);

  const clearError = () => setErrorMsg(null);

  const handleRegister = async () => {
    setErrorMsg(null);
    if (!fullName || !email || !employeeNumber || !phone || !password || !confirmPassword) {
      setErrorMsg(
        language === "ar"
          ? "جميع الحقول مطلوبة بما فيها رقم الموظف ورقم الهاتف"
          : "All fields including Employee Number and Phone are required."
      );
      return;
    }
    if (password.length < 8) {
      setErrorMsg(t("passwordMin"));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg(t("passwordMatch"));
      return;
    }
    setLoading(true);
    try {
      await register(
        email.trim().toLowerCase(),
        password,
        fullName,
        department,
        employeeNumber.trim(),
        phone.trim()
      );
      router.replace("/(tabs)/" as never);
    } catch (e: unknown) {
      setErrorMsg(mapFirebaseAuthError(e, language));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24),
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 40),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Logo size="medium" />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.heading, { color: colors.primary }, isRTL && styles.textRTL]}>
            {t("register")}
          </Text>

          {/* Inline error banner */}
          {!!errorMsg && (
            <View style={[styles.errorBanner, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
              <Icon name="alert-circle" size={15} color="#DC2626" />
              <Text style={[styles.errorText, isRTL && styles.textRTL]}>{errorMsg}</Text>
            </View>
          )}

          {/* Full Name */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("fullName")}
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}>
                <Icon name="person" size={16} color={colors.mutedForeground} />
              </View>
              <TextInput
                style={[styles.input, { color: colors.foreground }, isRTL && styles.textRTL]}
                value={fullName}
                onChangeText={(v) => { setFullName(v); clearError(); }}
                placeholder={t("fullName")}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("email")}
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}>
                <Icon name="mail" size={16} color={colors.mutedForeground} />
              </View>
              <TextInput
                ref={emailRef}
                style={[styles.input, { color: colors.foreground }, isRTL && styles.textRTL]}
                value={email}
                onChangeText={(v) => { setEmail(v); clearError(); }}
                placeholder={t("email")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => empNumRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>

          {/* Employee Number */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("employeeNumber")} *
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}>
                <Icon name="tag" size={16} color={colors.mutedForeground} />
              </View>
              <TextInput
                ref={empNumRef}
                style={[styles.input, { color: colors.foreground }, isRTL && styles.textRTL]}
                value={employeeNumber}
                onChangeText={(v) => { setEmployeeNumber(v); clearError(); }}
                placeholder="e.g. EMP-00123"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => deptRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>

          {/* Department */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("department")}
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}>
                <Icon name="briefcase" size={16} color={colors.mutedForeground} />
              </View>
              <TextInput
                ref={deptRef}
                style={[styles.input, { color: colors.foreground }, isRTL && styles.textRTL]}
                value={department}
                onChangeText={(v) => { setDepartment(v); clearError(); }}
                placeholder={t("department")}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>

          {/* Phone */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("phone")} *
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}>
                <Icon name="phone" size={16} color={colors.mutedForeground} />
              </View>
              <TextInput
                ref={phoneRef}
                style={[styles.input, { color: colors.foreground }, isRTL && styles.textRTL]}
                value={phone}
                onChangeText={(v) => { setPhone(v); clearError(); }}
                placeholder={isRTL ? "مثال: 0501234567" : "e.g. +966 50 123 4567"}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => pwRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("password")}
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}>
                <Icon name="lock" size={16} color={colors.mutedForeground} />
              </View>
              <TextInput
                ref={pwRef}
                style={[styles.input, { color: colors.foreground }]}
                value={password}
                onChangeText={(v) => { setPassword(v); clearError(); }}
                placeholder={t("password")}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPassword}
                returnKeyType="next"
                onSubmitEditing={() => confirmPwRef.current?.focus()}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {t("confirmPassword")}
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <View style={styles.icon}>
                <Icon name="lock" size={16} color={colors.mutedForeground} />
              </View>
              <TextInput
                ref={confirmPwRef}
                style={[styles.input, { color: colors.foreground }]}
                value={confirmPassword}
                onChangeText={(v) => { setConfirmPassword(v); clearError(); }}
                placeholder={t("confirmPassword")}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>{t("signUp")}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchBtn}
            onPress={() => router.push("/auth/login" as never)}
          >
            <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
              {t("haveAccount")}{" "}
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                {t("signIn")}
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
  logoContainer: { alignItems: "center", marginBottom: 24 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  heading: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 16 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#DC2626",
    lineHeight: 18,
  },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  icon: { marginRight: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  switchBtn: { marginTop: 16, alignItems: "center" },
  switchText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  textRTL: { textAlign: "right" },
});
