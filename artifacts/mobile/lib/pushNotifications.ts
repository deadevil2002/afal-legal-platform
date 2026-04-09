import { Platform } from "react-native";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserProfile } from "@/context/AuthContext";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushPayload {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
}

/** Lazy-load expo-notifications only when actually needed. Returns null if unavailable. */
async function getNotifications() {
  if (Platform.OS === "web") return null;
  try {
    // Dynamic require — avoids crashing Expo Go which removed push in SDK 53
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as typeof import("expo-notifications");
  } catch (_) {
    return null;
  }
}

/**
 * Register for push notifications and return the Expo Push Token string.
 * Returns null on web, if unavailable (Expo Go SDK 53+), or if user declines.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const N = await getNotifications();
  if (!N) return null;

  try {
    const { status: existingStatus } = await N.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await N.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;

    const tokenData = await N.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_REPL_ID ?? undefined,
    });
    return tokenData.data;
  } catch (_) {
    return null;
  }
}

/**
 * Send push notification(s) via Expo Push Service.
 * Works directly from the client — no backend server required.
 */
export async function sendPushNotification(payload: PushPayload): Promise<void> {
  const tokens = Array.isArray(payload.to) ? payload.to : [payload.to];
  const validTokens = tokens.filter(
    (t) => typeof t === "string" && t.startsWith("ExponentPushToken")
  );
  if (validTokens.length === 0) return;

  const messages = validTokens.map((token) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: payload.sound ?? "default",
  }));

  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
    });
  } catch (_) {
    // Non-fatal — push is best-effort
  }
}

/**
 * Get all push tokens belonging to admin users (assistant_admin + super_admin).
 */
export async function getAdminPushTokens(): Promise<string[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, "users"),
        where("role", "in", ["assistant_admin", "super_admin"])
      )
    );
    return snap.docs
      .map((d) => (d.data() as UserProfile & { pushToken?: string }).pushToken ?? "")
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Get the push token for a specific user by UID.
 */
export async function getUserPushToken(uid: string): Promise<string | null> {
  if (!uid) return null;
  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("uid", "==", uid))
    );
    if (snap.empty) return null;
    const data = snap.docs[0].data() as UserProfile & { pushToken?: string };
    return data.pushToken ?? null;
  } catch (_) {
    return null;
  }
}

/** Configure how notifications appear when the app is in the foreground. */
export async function configureNotificationHandler(): Promise<void> {
  const N = await getNotifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
