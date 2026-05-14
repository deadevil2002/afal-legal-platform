import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/useColors";

/**
 * Legacy new-request screen — retired as of AF Procurement Hub migration.
 * All request creation now goes through /procurement/new.
 * This shim exists solely to handle any deep-links or bookmarks that still
 * point to /request/new and redirect them to the correct screen.
 */
export default function LegacyNewRequestRedirect() {
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    router.replace("/procurement/new" as never);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
