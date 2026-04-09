import { useAuth } from "@/context/AuthContext";
import { translations, TranslationKey } from "@/i18n/translations";

export function useT() {
  const { language } = useAuth();
  const t = (key: TranslationKey): string => {
    return translations[language][key] ?? translations.en[key] ?? key;
  };
  const isRTL = language === "ar";
  return { t, isRTL, language };
}
