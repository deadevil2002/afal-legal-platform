import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconName } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useT } from "@/hooks/useT";

interface TabIconSpec {
  active: IconName;
  inactive: IconName;
}

const TAB_ICONS: Record<string, TabIconSpec> = {
  index:    { active: "home-fill",           inactive: "home" },
  requests: { active: "document-text-fill",  inactive: "document-text" },
  admin:    { active: "shield-check-fill",   inactive: "shield-check" },
  settings: { active: "cog-fill",            inactive: "cog" },
};

const TAB_CONTENT_HEIGHT = 56;

export default function TabLayout() {
  const colors = useColors();
  const { isAdmin } = useAuth();
  const { t } = useT();
  const insets = useSafeAreaInsets();

  const tabBarHeight = TAB_CONTENT_HEIGHT + insets.bottom;
  const tabBarPaddingBottom = insets.bottom + 4;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 6,
        },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
        ),
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
        tabBarIconStyle: { marginTop: 2 },
        tabBarIcon: ({ focused, color }) => {
          const spec = TAB_ICONS[route.name] ?? { active: "ellipse", inactive: "ellipse" };
          return (
            <Icon
              name={focused ? spec.active : spec.inactive}
              size={24}
              color={color}
              strokeWidth={1.75}
            />
          );
        },
      })}
    >
      <Tabs.Screen name="index"    options={{ title: t("home") }} />
      <Tabs.Screen name="requests" options={{ title: t("requests") }} />
      <Tabs.Screen name="admin"    options={isAdmin ? { title: t("admin") } : { href: null }} />
      <Tabs.Screen name="settings" options={{ title: t("settings") }} />
    </Tabs>
  );
}
