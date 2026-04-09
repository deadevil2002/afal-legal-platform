import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  query,
  writeBatch,
} from "firebase/firestore";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { auth, db } from "@/lib/firebase";

/**
 * INITIAL SUPER ADMIN — Bootstrap email for first-time setup only.
 * After a Super Admin transfer, the active super admin is tracked in
 * Firestore at settings/app.superAdminEmail.
 * This constant is only used as a fallback when settings/app doesn't exist yet.
 */
export const INITIAL_SUPER_ADMIN_EMAIL = "Naimi.salem@gmail.com";

export type UserRole = "user" | "assistant_admin" | "super_admin";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  fullName?: string;
  employeeNumber?: string;
  role: UserRole;
  department?: string;
  phone?: string;
  mobileNumber?: string;
  idNumber?: string;
  isActive?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  language?: "en" | "ar";
}

export interface AppSettings {
  superAdminEmail: string;
  previousSuperAdminEmail?: string;
  superAdminTransferredAt?: unknown;
  superAdminTransferredBy?: string;
  newSuperAdmin?: string;
  assistantAdmins?: string[];
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  activeSuperAdminEmail: string;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
    department?: string,
    employeeNumber?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  language: "en" | "ar";
  setLanguage: (lang: "en" | "ar") => Promise<void>;
  promoteToAssistantAdmin: (targetUid: string) => Promise<void>;
  demoteFromAdmin: (targetUid: string) => Promise<void>;
  transferSuperAdmin: (targetEmail: string, currentPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  getAllUsers: () => Promise<UserProfile[]>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Determine effective role.
 * Super Admin identity is dynamic — checked against activeSuperAdminEmail.
 */
function resolveRole(
  email: string,
  storedRole: UserRole,
  activeSuperAdminEmail: string
): UserRole {
  if (email.toLowerCase() === activeSuperAdminEmail.toLowerCase()) {
    return "super_admin";
  }
  return storedRole;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguageState] = useState<"en" | "ar">("en");
  /**
   * activeSuperAdminEmail: loaded from settings/app.superAdminEmail.
   * Falls back to INITIAL_SUPER_ADMIN_EMAIL until settings/app is created.
   */
  const [activeSuperAdminEmail, setActiveSuperAdminEmail] = useState(
    INITIAL_SUPER_ADMIN_EMAIL
  );

  // Load language preference from storage
  useEffect(() => {
    const loadLanguage = async () => {
      const stored = await AsyncStorage.getItem("@language");
      if (stored === "ar" || stored === "en") {
        setLanguageState(stored);
      }
    };
    loadLanguage();
  }, []);

  // Subscribe to settings/app to get the live super admin email (supports transfer)
  useEffect(() => {
    const settingsRef = doc(db, "settings", "app");
    const unsub = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as AppSettings;
          if (data.superAdminEmail) {
            setActiveSuperAdminEmail(data.superAdminEmail);
          }
        }
      },
      () => {
        // settings/app may not exist yet — use initial bootstrap email
      }
    );
    return unsub;
  }, []);

  // Re-resolve profile role whenever activeSuperAdminEmail changes
  useEffect(() => {
    if (profile && user) {
      const effectiveRole = resolveRole(
        user.email ?? "",
        profile.role,
        activeSuperAdminEmail
      );
      if (effectiveRole !== profile.role) {
        setProfile((prev) => prev ? { ...prev, role: effectiveRole } : prev);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSuperAdminEmail]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          // Fetch current super admin email from settings first
          let currentSuperAdminEmail = activeSuperAdminEmail;
          try {
            const settingsSnap = await getDoc(doc(db, "settings", "app"));
            if (settingsSnap.exists()) {
              const settings = settingsSnap.data() as AppSettings;
              if (settings.superAdminEmail) {
                currentSuperAdminEmail = settings.superAdminEmail;
                setActiveSuperAdminEmail(settings.superAdminEmail);
              }
            }
          } catch (_) {}

          const profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (profileDoc.exists()) {
            const data = profileDoc.data() as UserProfile;
            const effectiveRole = resolveRole(
              firebaseUser.email ?? "",
              data.role,
              currentSuperAdminEmail
            );
            const resolved: UserProfile = { ...data, role: effectiveRole };

            /**
             * Document integrity repair.
             *
             * The Firestore rule for profile updates requires several fields to
             * exist in the document (uid, email, createdAt, isActive, employeeNumber).
             * If ANY are missing (e.g. bootstrap SA document created before these
             * requirements existed), the profile save fails with permission-denied.
             *
             * Strategy: audit the live document for every required field and repair
             * in a single setDoc+merge call so the document is complete before the
             * user ever hits Save.
             *
             * setDoc+merge is used (not updateDoc) because it can add uid/createdAt
             * which are outside the updateDoc diff whitelist. The admin branch of the
             * Firestore rule allows this when isAdmin() resolves to true for the caller.
             */
            const repairNow = serverTimestamp();
            const repair: Record<string, unknown> = {};

            if (!data.uid) {
              repair.uid = firebaseUser.uid;
              console.log("[Auth] Repair: missing uid");
            }
            if (!data.email) {
              repair.email = (firebaseUser.email ?? "").toLowerCase();
              console.log("[Auth] Repair: missing email");
            }
            if (data.createdAt === undefined || data.createdAt === null) {
              repair.createdAt = repairNow;
              console.log("[Auth] Repair: missing createdAt");
            }
            if (data.isActive === undefined || data.isActive === null) {
              repair.isActive = true;
              console.log("[Auth] Repair: missing isActive");
            }
            if (!data.department) {
              repair.department =
                effectiveRole === "super_admin" ? "Administration" : "";
              console.log("[Auth] Repair: missing department");
            }
            if (!data.language) {
              repair.language = "en";
              console.log("[Auth] Repair: missing language");
            }
            if (!data.employeeNumber || data.employeeNumber.trim() === "") {
              repair.employeeNumber =
                effectiveRole === "super_admin"
                  ? "SA-001"
                  : `EMP-${firebaseUser.uid.slice(0, 8).toUpperCase()}`;
              console.log("[Auth] Repair: missing employeeNumber →", repair.employeeNumber);
            }

            if (Object.keys(repair).length > 0) {
              repair.updatedAt = repairNow;
              console.log(
                "[Auth] Repairing Firestore document — fields:",
                Object.keys(repair).join(", "),
                "uid:", firebaseUser.uid,
                "role:", effectiveRole
              );
              try {
                await setDoc(
                  doc(db, "users", firebaseUser.uid),
                  repair,
                  { merge: true }
                );
                // Update in-memory profile with repaired values
                // (server timestamps resolve as null initially; coerce to sensible defaults)
                if (repair.isActive !== undefined) resolved.isActive = true;
                if (repair.employeeNumber) resolved.employeeNumber = repair.employeeNumber as string;
                if (repair.department !== undefined) resolved.department = repair.department as string;
                if (repair.language) resolved.language = repair.language as "en" | "ar";
                if (repair.uid) resolved.uid = repair.uid as string;
                if (repair.email) resolved.email = repair.email as string;
                console.log("[Auth] Document repair succeeded");
              } catch (repairErr: unknown) {
                const e = repairErr as { code?: string; message?: string };
                console.error(
                  "[Auth] Document repair FAILED — code:", e.code,
                  "message:", e.message,
                  "repairPayload:", JSON.stringify(Object.keys(repair)),
                  "rawDocument:", JSON.stringify(data)
                );
              }
            } else {
              console.log(
                "[Auth] Profile complete — no repair needed.",
                "employeeNumber:", resolved.employeeNumber,
                "role:", resolved.role
              );
            }

            setProfile(resolved);
            if (data.language) {
              setLanguageState(data.language);
            }
          } else {
            // First login for bootstrap super admin — auto-create profile
            if (
              firebaseUser.email?.toLowerCase() ===
              currentSuperAdminEmail.toLowerCase()
            ) {
              const now = serverTimestamp();
              const superProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || "Super Admin",
                role: "super_admin",
                department: "Administration",
                // Firestore rule requires employeeNumber is string && size() > 0
                employeeNumber: "SA-001",
                isActive: true,
                createdAt: now,
                updatedAt: now,
                language: "en",
              };
              await setDoc(doc(db, "users", firebaseUser.uid), superProfile);
              // Initialize settings/app if not present
              const settingsSnap2 = await getDoc(doc(db, "settings", "app"));
              if (!settingsSnap2.exists()) {
                await setDoc(doc(db, "settings", "app"), {
                  superAdminEmail: firebaseUser.email.toLowerCase(),
                  assistantAdmins: [],
                });
              }
              setProfile(superProfile);
            }
          }
        } catch (_e) {
          // ignore
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSuperAdmin =
    profile?.role === "super_admin" ||
    (user?.email?.toLowerCase() === activeSuperAdminEmail.toLowerCase() ?? false);

  const isAdmin =
    profile?.role === "assistant_admin" ||
    profile?.role === "super_admin" ||
    isSuperAdmin;

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (
    email: string,
    password: string,
    displayName: string,
    department?: string,
    employeeNumber?: string
  ) => {
    if (email.toLowerCase() === activeSuperAdminEmail.toLowerCase()) {
      throw new Error(
        "This email is reserved for the primary administrator. Please sign in directly."
      );
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    const now = serverTimestamp();
    const newProfile: UserProfile = {
      uid: cred.user.uid,
      email,
      displayName,
      employeeNumber: employeeNumber?.trim() || "",
      role: "user",
      department: department || "",
      isActive: true,
      createdAt: now,
      updatedAt: now,
      language: "en",
    };
    await setDoc(doc(db, "users", cred.user.uid), newProfile);
    setProfile(newProfile);
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    /**
     * Strict whitelist — only fields the Firestore rule allows in the diff.
     * Rule: affectedKeys().hasOnly(["displayName","department","phone",
     *        "language","employeeNumber","updatedAt","isActive"])
     */
    const ALLOWED: (keyof UserProfile)[] = [
      "displayName",
      "department",
      "phone",
      "language",
      "isActive",
      "employeeNumber",
    ];
    const safe: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in data) safe[key] = (data as Record<string, unknown>)[key];
    }
    safe.updatedAt = serverTimestamp();

    /**
     * Firestore rule also requires:
     *   request.resource.data.employeeNumber is string && size() > 0
     * This operates on the FULL resulting document (old fields + new fields
     * merged). If employeeNumber would be absent or empty in the result,
     * the write is rejected.
     *
     * Guarantee: always send a non-empty employeeNumber so the resulting
     * document satisfies the rule — even if the caller didn't include it.
     */
    const outgoingEmpNum = (safe.employeeNumber as string | undefined)?.trim();
    if (!outgoingEmpNum) {
      // Fall back to whatever is already stored on the profile
      const existingEmpNum = profile?.employeeNumber?.trim();
      if (existingEmpNum) {
        safe.employeeNumber = existingEmpNum;
      } else {
        // Generate a stable placeholder so the rule passes (uid-derived)
        safe.employeeNumber = `EMP-${user.uid.slice(0, 8).toUpperCase()}`;
      }
    }

    // updateDoc merges the fields — uid, email, role, createdAt are untouched.
    console.log(
      "[ProfileUpdate] uid:", user.uid,
      "role:", profile?.role,
      "employeeNumber in doc:", profile?.employeeNumber,
      "payload keys:", Object.keys(safe).join(", "),
      "payload:", JSON.stringify(safe)
    );
    try {
      await updateDoc(doc(db, "users", user.uid), safe);
    } catch (writeErr: unknown) {
      const e = writeErr as { code?: string; message?: string };
      console.error(
        "[ProfileUpdate] FAILED — code:", e.code,
        "message:", e.message,
        "uid:", user.uid,
        "role:", profile?.role,
        "Firestore doc fields (from profile context):", JSON.stringify({
          uid: profile?.uid,
          email: profile?.email,
          role: profile?.role,
          employeeNumber: profile?.employeeNumber,
          createdAt: String(profile?.createdAt),
          department: profile?.department,
          displayName: profile?.displayName,
          phone: profile?.phone,
          language: profile?.language,
          isActive: profile?.isActive,
        })
      );
      throw writeErr;
    }
    setProfile((prev) => (prev ? { ...prev, ...safe } : prev));
  };

  const setLanguage = async (lang: "en" | "ar") => {
    setLanguageState(lang);
    await AsyncStorage.setItem("@language", lang);
    if (user) {
      await updateDoc(doc(db, "users", user.uid), { language: lang });
    }
  };

  /**
   * SUPER ADMIN ONLY — promote a regular user to assistant admin.
   * Enforced both client-side and in Firestore security rules.
   */
  const promoteToAssistantAdmin = async (targetUid: string) => {
    if (!isSuperAdmin) throw new Error("Unauthorized: Super Admin only.");
    const targetRef = doc(db, "users", targetUid);
    const snap = await getDoc(targetRef);
    if (!snap.exists()) throw new Error("User not found.");
    const targetProfile = snap.data() as UserProfile;
    if (targetProfile.role === "super_admin") {
      throw new Error("Cannot modify the Super Admin account.");
    }
    await updateDoc(targetRef, {
      role: "assistant_admin",
      updatedAt: serverTimestamp(),
    });
  };

  /**
   * SUPER ADMIN ONLY — demote an assistant admin back to regular user.
   */
  const demoteFromAdmin = async (targetUid: string) => {
    if (!isSuperAdmin) throw new Error("Unauthorized: Super Admin only.");
    const targetRef = doc(db, "users", targetUid);
    const snap = await getDoc(targetRef);
    if (!snap.exists()) throw new Error("User not found.");
    const targetProfile = snap.data() as UserProfile;
    if (targetProfile.role === "super_admin") {
      throw new Error("Cannot modify the Super Admin account.");
    }
    await updateDoc(targetRef, {
      role: "user",
      updatedAt: serverTimestamp(),
    });
  };

  /**
   * SUPER ADMIN ONLY — transfer Super Admin ownership to another registered user.
   * Requires password re-authentication before executing.
   * Writes a full audit trail to Firestore and updates settings/app atomically.
   */
  const transferSuperAdmin = async (
    targetEmail: string,
    currentPassword: string
  ) => {
    if (!isSuperAdmin || !user || !user.email) {
      throw new Error("Unauthorized: Super Admin only.");
    }
    if (targetEmail.toLowerCase() === user.email.toLowerCase()) {
      throw new Error("You cannot transfer Super Admin to yourself.");
    }

    // Step 1: Re-authenticate to confirm identity
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Step 2: Find the target user in Firestore by email
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

    // Step 3: Atomic batch — update all records together
    const batch = writeBatch(db);

    // Update settings/app with new super admin identity and audit fields
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

    // Write immutable audit log entry
    batch.set(doc(collection(db, "audit_logs")), {
      type: "super_admin_transfer",
      previousSuperAdmin: user.email.toLowerCase(),
      previousSuperAdminUid: user.uid,
      newSuperAdmin: targetEmail.toLowerCase(),
      newSuperAdminUid: targetUid,
      transferredBy: user.uid,
      transferredAt: now,
    });

    // Downgrade previous super admin to assistant_admin
    batch.update(doc(db, "users", user.uid), {
      role: "assistant_admin",
      updatedAt: now,
    });

    // Elevate new super admin
    batch.update(doc(db, "users", targetUid), {
      role: "super_admin",
      updatedAt: now,
    });

    await batch.commit();

    // Local profile will update via the settings/app onSnapshot listener
  };

  /**
   * ALL USERS — securely change password using Firebase re-authentication.
   * Requires the user's current password before the new password is applied.
   * This uses reauthenticateWithCredential (same pattern as transferSuperAdmin)
   * followed by updatePassword — no Firestore writes required.
   */
  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user || !user.email) {
      throw new Error("You must be signed in to change your password.");
    }
    // Step 1: Re-authenticate with current credentials to confirm identity
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    // Step 2: Update password via Firebase Auth (enforces minimum length server-side)
    await updatePassword(user, newPassword);
  };

  /**
   * ADMIN/SUPER ADMIN ONLY — fetch all registered users.
   */
  const getAllUsers = async (): Promise<UserProfile[]> => {
    if (!isAdmin) throw new Error("Unauthorized.");
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map((d) => {
      const data = d.data() as UserProfile;
      return {
        ...data,
        role: resolveRole(data.email, data.role, activeSuperAdminEmail),
      };
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isSuperAdmin,
        isAdmin,
        activeSuperAdminEmail,
        login,
        register,
        logout,
        updateUserProfile,
        language,
        setLanguage,
        promoteToAssistantAdmin,
        demoteFromAdmin,
        transferSuperAdmin,
        changePassword,
        getAllUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
