import * as Notifications from "expo-notifications";
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

/**
 * Register for push notifications and return the Expo Push Token string.
 * Returns null if on web or if the user declines permissions.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_REPL_ID ?? undefined,
    });
    return tokenData.data;
  } catch (_e) {
    return null;
  }
}

/**
 * Send push notification(s) via Expo Push Service.
 * Works directly from the client — no backend server required.
 */
export async function sendPushNotification(payload: PushPayload): Promise<void> {
  if (Platform.OS === "web") return;
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
  } catch (_e) {
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
  } catch (_e) {
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
  } catch (_e) {
    return null;
  }
}

/** Configure how notifications appear when the app is in the foreground. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
