import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/**
 * Firestore initialisation — environment-aware.
 *
 * Web / Replit preview (Platform.OS === "web"):
 *   Sandboxed iframes block the SQLite/IndexedDB APIs that Firestore uses
 *   for offline persistence, producing:
 *     "Failed to connect: sync error: Failed to initialize SQLite persistence"
 *   Fix: use in-memory cache only (no disk layer).
 *
 * Native iOS / Android (production):
 *   getFirestore() uses the default persistent local cache, so the app
 *   works offline and benefits from query caching exactly as before.
 *   Nothing changes for the production mobile build.
 */
export const db =
  Platform.OS === "web"
    ? initializeFirestore(app, { localCache: memoryLocalCache() })
    : getFirestore(app);

export default app;
