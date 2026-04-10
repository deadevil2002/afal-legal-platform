import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { RequestsProvider } from "@/context/RequestsContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AuthGate() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const seg0 = segments[0] ?? "(none)";
    const inAuth = seg0 === "auth";
    console.log("[AUTHGATE] effect user=" + !!user + " profile=" + !!profile + " loading=" + loading + " seg0=" + seg0 + " inAuth=" + inAuth);
    if (loading) {
      console.log("[AUTHGATE] decision=wait_loading");
      return;
    }
    if (!user && !inAuth) {
      console.log("[AUTHGATE] decision=redirect_to_login user=false inAuth=false");
      router.replace("/auth/login" as never);
    } else if (user && profile && inAuth) {
      console.log("[AUTHGATE] decision=redirect_to_tabs user=true profile=true inAuth=true");
      router.replace("/(tabs)/" as never);
    } else {
      console.log("[AUTHGATE] decision=no_action user=" + !!user + " profile=" + !!profile + " inAuth=" + inAuth);
    }
  }, [user, profile, loading, segments]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/register" options={{ headerShown: false }} />
        <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="request/new" options={{ headerShown: false }} />
        <Stack.Screen name="request/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="transfer-super-admin" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RequestsProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </RequestsProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
