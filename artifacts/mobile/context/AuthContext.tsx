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
    employeeNumber?: string,
    phone?: string
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

/**
 * Normalize a phone number to a consistent digit-only format for uniqueness indexing.
 * Maps local Saudi (0-prefixed) and international (+966) numbers to "966XXXXXXXXX".
 * Strips all non-digit characters before normalizing.
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("0")) return "966" + digits.slice(1);
  return "966" + digits;
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
    employeeNumber?: string,
    phone?: string
  ) => {
    if (email.toLowerCase() === activeSuperAdminEmail.toLowerCase()) {
      throw new Error(
        "This email is reserved for the primary administrator. Please sign in directly."
      );
    }

    const trimmedEmpNum = (employeeNumber?.trim() || "");
    const normalizedPhone = normalizePhone(phone?.trim() || "");

    // ── Create Firebase Auth account ───────────────────────────────────────
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });

    const now = serverTimestamp();
    const newProfile: UserProfile = {
      uid: cred.user.uid,
      email,
      displayName,
      employeeNumber: trimmedEmpNum,
      role: "user",
      department: department || "",
      phone: normalizedPhone,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      language: "en",
    };

    // Set profile in memory immediately.
    // This prevents the race window where onAuthStateChanged fires (finding no
    // Firestore doc yet) and calls setLoading(false) with profile=null, which
    // would briefly make the app think no user is logged in.
    setProfile(newProfile);

    // ── Atomically write all required Firestore documents ──────────────────
    // Index reads are disabled by Firestore rules (allow read: if false).
    // Uniqueness is enforced server-side via !exists(...) in the create rule.
    // A batch failure with permission-denied means phone or emp number is taken.
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "users", cred.user.uid), newProfile);
      if (normalizedPhone) {
        // Rule requires: request.resource.data.phone == normalizedPhone (document ID)
        batch.set(doc(db, "user_phone_index", normalizedPhone), {
          uid: cred.user.uid,
          phone: normalizedPhone,
          createdAt: now,
        });
      }
      if (trimmedEmpNum) {
        // Rule requires: request.resource.data.employeeNumber == employeeNumber (document ID)
        batch.set(doc(db, "user_employee_index", trimmedEmpNum), {
          uid: cred.user.uid,
          employeeNumber: trimmedEmpNum,
          createdAt: now,
        });
      }
      await batch.commit();
    } catch (firestoreErr: unknown) {
      // Firestore write failed — clean up so the user can retry cleanly.
      setProfile(null);
      try {
        await cred.user.delete();
      } catch (_) {
        // If delete fails, sign out so the orphaned session doesn't persist.
        await signOut(auth).catch(() => {});
      }
      // permission-denied from the batch means the !exists() uniqueness guard
      // in the Firestore rules fired — phone or employee number already taken.
      const code = (firestoreErr as { code?: string })?.code;
      if (code === "permission-denied") {
        throw new Error("phone_or_employee_taken");
      }
      throw firestoreErr;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    /**
     * Strict whitelist — exactly matches the Firestore rule for self-updates:
     * affectedKeys().hasOnly([
     *   "displayName","department","phone","language","employeeNumber","updatedAt"
     * ])
     * Protected fields (uid, email, role, createdAt, isActive) must never be
     * included in a normal-user update payload or the write is denied.
     */
    const ALLOWED: (keyof UserProfile)[] = [
      "displayName",
      "department",
      "phone",
      "language",
      "employeeNumber",
    ];
    const safe: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in data) safe[key] = (data as Record<string, unknown>)[key];
    }
    safe.updatedAt = serverTimestamp();

    // ── Phone normalization ────────────────────────────────────────────────
    // The Firestore rule requires phone.size() > 0 in the resulting document.
    // Normalize the incoming phone so it matches the index document ID format.
    // If the caller sends an empty phone, omit it from the payload entirely —
    // this preserves the existing non-empty value already stored in Firestore.
    if ("phone" in safe) {
      const normalizedNewPhone = normalizePhone((safe.phone as string) || "");
      if (normalizedNewPhone) {
        safe.phone = normalizedNewPhone;
      } else {
        // Empty phone after normalization — preserve the existing stored value.
        delete safe.phone;
      }
    }

    // ── Employee number guarantee ──────────────────────────────────────────
    // Firestore rule requires: request.resource.data.employeeNumber is string.
    // Always ensure a non-empty employee number is in the payload.
    const outgoingEmpNum = (safe.employeeNumber as string | undefined)?.trim();
    if (!outgoingEmpNum) {
      const existingEmpNum = profile?.employeeNumber?.trim();
      safe.employeeNumber = existingEmpNum || `EMP-${user.uid.slice(0, 8).toUpperCase()}`;
    }

    // ── Detect index-relevant changes ────────────────────────────────────
    // Compare normalized new values against what is currently stored.
    const oldPhone = normalizePhone(profile?.phone || "");
    const newPhone = (safe.phone as string) || "";
    const phoneChanged = !!newPhone && newPhone !== oldPhone;

    const oldEmpNum = (profile?.employeeNumber || "").trim();
    const newEmpNum = ((safe.employeeNumber as string) || "").trim();
    const empNumChanged = !!newEmpNum && newEmpNum !== oldEmpNum;

    if (phoneChanged || empNumChanged) {
      /**
       * Index-managing batch:
       * 1. Update users/{uid} with the safe payload
       * 2. Create new index document(s) for changed phone/empNum
       *    — Firestore rule: allow create if !exists() → enforces uniqueness server-side
       *    — permission-denied here means the new value is already taken by another user
       * 3. Delete old index document(s) so the old identifiers are freed
       *    — Firestore rule: allow delete if uid == auth.uid (self-deletion)
       */
      const now = serverTimestamp();
      const batch = writeBatch(db);

      // Always update the user document
      batch.update(doc(db, "users", user.uid), safe);

      if (phoneChanged) {
        // Create new phone index (will be denied by !exists() if already taken)
        batch.set(doc(db, "user_phone_index", newPhone), {
          uid: user.uid,
          phone: newPhone,
          createdAt: now,
        });
        // Free the old phone index so it can be registered by another user
        if (oldPhone) {
          batch.delete(doc(db, "user_phone_index", oldPhone));
        }
      }

      if (empNumChanged) {
        // Create new employee number index
        batch.set(doc(db, "user_employee_index", newEmpNum), {
          uid: user.uid,
          employeeNumber: newEmpNum,
          createdAt: now,
        });
        // Free the old employee number index
        if (oldEmpNum) {
          batch.delete(doc(db, "user_employee_index", oldEmpNum));
        }
      }

      try {
        await batch.commit();
      } catch (batchErr: unknown) {
        const code = (batchErr as { code?: string })?.code;
        if (code === "permission-denied") {
          throw new Error("phone_or_employee_taken");
        }
        throw batchErr;
      }
    } else {
      // No index-relevant change — simple updateDoc is sufficient.
      await updateDoc(doc(db, "users", user.uid), safe);
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
