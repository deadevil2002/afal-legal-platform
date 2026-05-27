import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  writeBatch,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
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
  updateMyProfile: (fields: Partial<Pick<UserProfile, "displayName" | "phone" | "department">>) => Promise<void>;
  transferSuperAdmin: (targetEmail: string, currentPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeSuperAdminEmail, setActiveSuperAdminEmail] = useState(INITIAL_SUPER_ADMIN_EMAIL);
  const [loading, setLoading] = useState(true);

  // Live-listen to settings/app for super admin email
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

  // Auth state listener
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
        // profile load failed
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const isSuperAdmin =
    profile?.role === "super_admin" ||
    (!!user?.email && user.email.toLowerCase() === activeSuperAdminEmail.toLowerCase());

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

  const updateMyProfile = async (
    fields: Partial<Pick<UserProfile, "displayName" | "phone" | "department">>
  ) => {
    if (!user) throw new Error("Not signed in.");
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (fields.displayName !== undefined) updates.displayName = fields.displayName;
    if (fields.phone !== undefined) updates.phone = fields.phone;
    if (fields.department !== undefined) updates.department = fields.department;

    await updateDoc(doc(db, "users", user.uid), updates);

    // Also update Firebase Auth display name if changed
    if (fields.displayName && auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: fields.displayName });
    }

    // Refresh local profile
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      setProfile({ uid: snap.id, ...(snap.data() as Omit<UserProfile, "uid">) });
    }
  };

  const transferSuperAdmin = async (targetEmail: string, currentPassword: string) => {
    if (!isSuperAdmin || !user || !user.email) {
      throw new Error("Unauthorized: Super Admin only.");
    }
    if (targetEmail.toLowerCase() === user.email.toLowerCase()) {
      throw new Error("You cannot transfer Super Admin to yourself.");
    }

    // Re-authenticate
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Find target user in Firestore
    const usersSnap = await getDocs(
      query(collection(db, "users"), where("email", "==", targetEmail.toLowerCase()))
    );
    if (usersSnap.empty) {
      throw new Error(
        "No registered account found with that email. The target user must already be registered in the app."
      );
    }
    const targetDoc = usersSnap.docs[0];
    const targetUid = targetDoc.id;

    const now = serverTimestamp();
    const batch = writeBatch(db);

    // Update settings/app
    batch.set(
      doc(db, "settings", "app"),
      {
        superAdminEmail: targetEmail.toLowerCase(),
        previousSuperAdminEmail: user.email.toLowerCase(),
        superAdminTransferredAt: now,
        superAdminTransferredBy: user.uid,
        newSuperAdmin: targetEmail.toLowerCase(),
      },
      { merge: true }
    );

    // Immutable audit log
    batch.set(doc(collection(db, "audit_logs")), {
      type: "super_admin_transfer",
      previousSuperAdmin: user.email.toLowerCase(),
      previousSuperAdminUid: user.uid,
      newSuperAdmin: targetEmail.toLowerCase(),
      newSuperAdminUid: targetUid,
      transferredBy: user.uid,
      transferredAt: now,
    });

    // Downgrade previous super admin
    batch.update(doc(db, "users", user.uid), { role: "assistant_admin", updatedAt: now });

    // Elevate new super admin
    batch.update(doc(db, "users", targetUid), { role: "super_admin", updatedAt: now });

    await batch.commit();
    // activeSuperAdminEmail updates automatically via the settings/app onSnapshot listener
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isSuperAdmin,
        loading,
        activeSuperAdminEmail,
        login,
        logout,
        updateMyProfile,
        transferSuperAdmin,
      }}
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
