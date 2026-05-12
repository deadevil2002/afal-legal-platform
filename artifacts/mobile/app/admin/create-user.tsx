import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useAuth, UserRole, AdminCreateUserParams } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

const ROLE_OPTIONS: Array<{ role: UserRole; color: string }> = [
  { role: "ceo",         color: "#7C3AED" },
  { role: "evp",         color: "#5D1E5E" },
  { role: "operations",  color: "#B45309" },
  { role: "planning",    color: "#006485" },
  { role: "finance",     color: "#16A8BA" },
  { role: "procurement", color: "#2D6491" },
];

export default function CreateUserScreen() {
  const colors = useColors();
  const { t, isRTL, language } = useT();
  const { isSuperAdmin, adminCreateUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("procurement");
  const [canSubmitRequests, setCanSubmitRequests] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const empNumRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const deptRef = useRef<TextInput>(null);
  const pwRef = useRef<TextInput>(null);
  const confirmPwRef = useRef<TextInput>(null);

  const clearError = () => setErrorMsg(null);

  const roleLabel = (role: string): string => {
    if (role === "ceo") return t("roleCeo");
    if (role === "evp") return t("roleEvp");
    if (role === "operations") return t("roleOperations");
    if (role === "planning") return t("rolePlanning");
    if (role === "finance") return t("roleFinance");
    if (role === "procurement") return t("roleProcurement");
    return role;
  };

  const handleSubmit = async () => {
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg(language === "ar" ? "الاسم الكامل مطلوب." : "Full name is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMsg(language === "ar" ? "يرجى إدخال بريد إلكتروني صحيح." : "Please enter a valid email address.");
      return;
    }
    if (!employeeNumber.trim()) {
      setErrorMsg(language === "ar" ? "رقم الموظف مطلوب." : "Employee number is required.");
      return;
    }
    if (!phone.trim()) {
      setErrorMsg(language === "ar" ? "رقم الهاتف مطلوب." : "Phone number is required.");
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
      const params: AdminCreateUserParams = {
        email: email.trim().toLowerCase(),
        password,
        displayName: fullName.trim(),
        employeeNumber: employeeNumber.trim(),
        phone: phone.trim(),
        department: department.trim(),
        role: selectedRole,
        canSubmitRequests,
      };
      await adminCreateUser(params);
      Alert.alert(
        t("success"),
        t("userCreatedSuccess"),
        [
          {
            text: t("ok"),
            onPress: () => router.back(),
          },
        ]
      );
    } catch (e: unknown) {
      const err = e as { message?: string };
      const msg = err?.message ?? "";
      if (msg === "email_taken") {
        setErrorMsg(t("emailTaken"));
      } else if (msg === "phone_taken") {
        setErrorMsg(t("phoneTaken"));
      } else if (msg === "employee_taken") {
        setErrorMsg(t("employeeTaken"));
      } else {
        setErrorMsg(msg || t("errGeneric"));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="lock" size={48} color={colors.border} />
        <Text style={[styles.accessDenied, { color: colors.foreground }]}>{t("accessDenied")}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t("createUserTitle")}</Text>
          <Text style={styles.headerSubtitle}>{t("createUserSubtitle")}</Text>
        </View>
        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>{t("createUser")}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Error banner */}
        {!!errorMsg && (
          <View style={[styles.errorBanner, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
            <Icon name="alert-circle" size={15} color="#DC2626" />
            <Text style={[styles.errorText, isRTL && styles.textRTL]}>{errorMsg}</Text>
          </View>
        )}

        {/* Full Name */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {t("fullName").toUpperCase()} *
          </Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Icon name="person" size={15} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
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
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {t("email").toUpperCase()} *
          </Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Icon name="mail" size={15} color={colors.mutedForeground} />
            <TextInput
              ref={emailRef}
              style={[styles.input, { color: colors.foreground }]}
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
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {t("employeeNumber").toUpperCase()} *
          </Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Icon name="tag" size={15} color={colors.mutedForeground} />
            <TextInput
              ref={empNumRef}
              style={[styles.input, { color: colors.foreground }]}
              value={employeeNumber}
              onChangeText={(v) => { setEmployeeNumber(v); clearError(); }}
              placeholder="e.g. EMP-00123"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>
        </View>

        {/* Phone */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {t("phone").toUpperCase()} *
          </Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Icon name="phone" size={15} color={colors.mutedForeground} />
            <TextInput
              ref={phoneRef}
              style={[styles.input, { color: colors.foreground }]}
              value={phone}
              onChangeText={(v) => { setPhone(v); clearError(); }}
              placeholder="+966 50 123 4567"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => deptRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>
        </View>

        {/* Department (optional) */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {t("department").toUpperCase()}
          </Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Icon name="briefcase" size={15} color={colors.mutedForeground} />
            <TextInput
              ref={deptRef}
              style={[styles.input, { color: colors.foreground }]}
              value={department}
              onChangeText={(v) => { setDepartment(v); clearError(); }}
              placeholder={t("department")}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => pwRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>
        </View>

        {/* Initial Password */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {t("initialPassword").toUpperCase()} *
          </Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Icon name="lock" size={15} color={colors.mutedForeground} />
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
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Confirm Password */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {t("confirmPassword").toUpperCase()} *
          </Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Icon name="lock" size={15} color={colors.mutedForeground} />
            <TextInput
              ref={confirmPwRef}
              style={[styles.input, { color: colors.foreground }]}
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); clearError(); }}
              placeholder={t("confirmPassword")}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>
        </View>

        {/* Role Selector */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("selectRole")}</Text>
          <View style={styles.roleGrid}>
            {ROLE_OPTIONS.map(({ role, color }) => {
              const selected = selectedRole === role;
              return (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleChip,
                    { borderColor: color },
                    selected && { backgroundColor: color + "22", borderWidth: 2 },
                  ]}
                  onPress={() => setSelectedRole(role)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.roleChipText, { color }]}>{roleLabel(role)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Can Submit Requests Toggle */}
        <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, { color: colors.foreground }]}>
              {t("canSubmitRequests")}
            </Text>
            <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
              {t("canSubmitRequestsSubtitle")}
            </Text>
          </View>
          <Switch
            value={canSubmitRequests}
            onValueChange={setCanSubmitRequests}
            trackColor={{ false: colors.border, true: colors.secondary }}
            thumbColor="#fff"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  accessDenied: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  backBtn: { paddingBottom: 2 },
  headerCenter: { flex: 1, gap: 2 },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
  },
  submitBtn: {
    backgroundColor: "#2D6491",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  submitBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 0 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#DC2626",
    lineHeight: 18,
  },
  field: { marginBottom: 14 },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  section: { marginBottom: 14, gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  roleChipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 14,
  },
  toggleLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  toggleSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  textRTL: { textAlign: "right" },
});
