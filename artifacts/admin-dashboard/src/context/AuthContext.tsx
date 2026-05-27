import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { lookupEmployee } from "@/lib/api";
import type { UserProfile } from "@/types";

const INITIAL_SUPER_ADMIN_EMAIL = "Naimi.salem@gmail.com";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isSuperAdmin: boolean;
  loading: boolean;
  activeSuperAdminEmail: string;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeSuperAdminEmail, setActiveSuperAdminEmail] = useState(INITIAL_SUPER_ADMIN_EMAIL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "app"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data?.superAdminEmail === "string") {
            setActiveSuperAdminEmail(data.superAdminEmail);
          }
        }
      },
      () => {}
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setUser(firebaseUser);
      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (snap.exists()) {
          setProfile({ uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) });
        }
      } catch {
        // profile load failed — user will see Access Denied if role check fails
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const isSuperAdmin =
    profile?.role === "super_admin" ||
    (!!user?.email &&
      user.email.toLowerCase() === activeSuperAdminEmail.toLowerCase());

  const login = async (identifier: string, password: string) => {
    let email = identifier.trim();
    if (!email.includes("@")) {
      const resolved = await lookupEmployee(email);
      if (!resolved?.email) throw new Error("Employee number not found. Please check and try again.");
      email = resolved.email;
    }
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, isSuperAdmin, loading, activeSuperAdminEmail, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
