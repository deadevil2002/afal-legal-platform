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
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { doc, updateDoc } from "firebase/firestore";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { RequestsProvider } from "@/context/RequestsContext";
import { db } from "@/lib/firebase";
import {
  configureNotificationHandler,
  registerForPushNotifications,
} from "@/lib/pushNotifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/** Register push token once the user is authenticated and store it in Firestore. */
function PushSetup() {
  const { user } = useAuth();

  useEffect(() => {
    if (Platform.OS === "web") return;
    void configureNotificationHandler();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const token = await registerForPushNotifications();
      if (!cancelled && token && user.uid) {
        try {
          await updateDoc(doc(db, "users", user.uid), { pushToken: token });
        } catch (_) {}
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  return null;
}

function AuthGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "auth";
    if (!user && !inAuth) {
      router.replace("/auth/login" as never);
    } else if (user && inAuth) {
      router.replace("/(tabs)/" as never);
    }
  }, [user, loading, segments]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <AuthGate />
      <PushSetup />
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
