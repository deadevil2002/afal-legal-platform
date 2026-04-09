type Lang = "en" | "ar";

interface ErrorMessages {
  en: string;
  ar: string;
}

const AUTH_ERROR_MAP: Record<string, ErrorMessages> = {
  "auth/invalid-credential": {
    en: "Incorrect email or password.",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  },
  "auth/user-not-found": {
    en: "No account found with this email.",
    ar: "لا يوجد حساب بهذا البريد الإلكتروني",
  },
  "auth/wrong-password": {
    en: "Incorrect password.",
    ar: "كلمة المرور غير صحيحة",
  },
  "auth/too-many-requests": {
    en: "Too many failed attempts. Please try again later.",
    ar: "محاولات كثيرة جداً، يرجى المحاولة لاحقاً",
  },
  "auth/email-already-in-use": {
    en: "This email address is already registered.",
    ar: "هذا البريد الإلكتروني مسجّل بالفعل",
  },
  "auth/invalid-email": {
    en: "Please enter a valid email address.",
    ar: "يرجى إدخال بريد إلكتروني صحيح",
  },
  "auth/network-request-failed": {
    en: "Network error. Please check your connection.",
    ar: "خطأ في الاتصال، يرجى التحقق من شبكتك",
  },
  "auth/weak-password": {
    en: "Password is too weak. Use at least 8 characters.",
    ar: "كلمة المرور ضعيفة، استخدم 8 أحرف على الأقل",
  },
  "auth/user-disabled": {
    en: "This account has been disabled. Please contact support.",
    ar: "تم تعطيل هذا الحساب، يرجى التواصل مع الدعم",
  },
  "auth/operation-not-allowed": {
    en: "This sign-in method is not enabled.",
    ar: "طريقة تسجيل الدخول هذه غير مفعّلة",
  },
  "auth/requires-recent-login": {
    en: "Please sign in again to complete this action.",
    ar: "يرجى تسجيل الدخول مجدداً لإتمام هذا الإجراء",
  },
};

/**
 * Maps a raw Firebase auth error to a clean, user-friendly message.
 * Extracts the error code from the full message string if needed.
 */
export function mapFirebaseAuthError(
  error: unknown,
  lang: Lang = "en"
): string {
  const raw = (error as { code?: string; message?: string }) ?? {};
  const code =
    raw.code ??
    (() => {
      const msg = raw.message ?? "";
      const match = msg.match(/\(([^)]+)\)/);
      return match ? match[1] : "";
    })();

  const entry = AUTH_ERROR_MAP[code ?? ""];
  if (entry) {
    return entry[lang] ?? entry.en;
  }
  return lang === "ar"
    ? "حدث خطأ غير متوقع. يرجى المحاولة مجدداً."
    : "Something went wrong. Please try again.";
}
