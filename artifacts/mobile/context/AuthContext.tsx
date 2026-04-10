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
  addDoc,
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

export interface ProfileChangeRequest {
  id: string;
  userId: string;
  field: "phone" | "employeeNumber";
  currentValue: string;
  requestedValue: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: unknown;
  updatedAt: unknown;
  adminReason: string;
  userName?: string;
  userEmail?: string;
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
  requestProfileChange: (field: "phone" | "employeeNumber", requestedValue: string) => Promise<void>;
  approveProfileChange: (changeRequestId: string, req: ProfileChangeRequest) => Promise<void>;
  rejectProfileChange: (changeRequestId: string, reason: string) => Promise<void>;
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
             * Lightweight document repair — only fields allowed by the
             * normal-user Firestore update rule:
             *   affectedKeys().hasOnly(["displayName","department","language","updatedAt"])
             *
             * Protected fields (uid, email, createdAt, isActive, employeeNumber,
             * phone, role) MUST NOT be written here. Writing them via updateDoc
             * or setDoc+merge will trigger the rule's equality checks and fail
             * with permission-denied for normal users.
             *
             * If a user doc is missing protected fields entirely, that is a sign
             * the registration flow did not complete correctly — it is NOT safe
             * to repair them from the client after the fact. Those docs should
             * only be created via the register() function below which writes all
             * required fields in one atomic operation.
             */
            const repairNow = serverTimestamp();
            const repair: Record<string, unknown> = {};

            if (!data.department && data.department !== "") {
              repair.department =
                effectiveRole === "super_admin" ? "Administration" : "";
            }
            if (!data.language) {
              repair.language = "en";
            }

            if (Object.keys(repair).length > 0) {
              repair.updatedAt = repairNow;
              try {
                await updateDoc(doc(db, "users", firebaseUser.uid), repair);
                if (repair.department !== undefined) resolved.department = repair.department as string;
                if (repair.language) resolved.language = repair.language as "en" | "ar";
              } catch (repairErr: unknown) {
                const e = repairErr as { code?: string; message?: string };
                console.error(
                  "[Auth] Soft repair FAILED — code:", e.code,
                  "fields:", JSON.stringify(Object.keys(repair))
                );
              }
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
     * Strict whitelist — exactly matches the Firestore rule for normal-user self-updates:
     * affectedKeys().hasOnly(["displayName","department","language","updatedAt"])
     *
     * phone and employeeNumber are intentionally excluded:
     *   - The rule now requires phone == resource.data.phone (unchanged)
     *   - The rule now requires employeeNumber == resource.data.employeeNumber (unchanged)
     *   - Changes to phone/employeeNumber go through requestProfileChange() → admin approval
     *
     * Protected fields (uid, email, role, createdAt, isActive) must never be
     * sent in the payload — the rule does NOT permit their modification here.
     */
    const ALLOWED: (keyof UserProfile)[] = [
      "displayName",
      "department",
      "language",
    ];
    const safe: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in data) safe[key] = (data as Record<string, unknown>)[key];
    }
    safe.updatedAt = serverTimestamp();

    await updateDoc(doc(db, "users", user.uid), safe);
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

  /**
   * ALL USERS — submit a request to change phone or employeeNumber.
   * Writes a profile_change_requests document. Super Admin must approve.
   * The currentValue is sourced from the live profile context so the Firestore
   * rule's "currentValue.size() > 0" and "requestedValue != currentValue" checks
   * are met accurately.
   */
  const requestProfileChange = async (
    field: "phone" | "employeeNumber",
    requestedValue: string
  ) => {
    if (!user || !profile) throw new Error("Not authenticated");
    const trimmed = requestedValue.trim();
    if (!trimmed) throw new Error("value_required");
    const currentValue =
      field === "phone"
        ? (profile.phone || "")
        : (profile.employeeNumber || "");
    if (trimmed === currentValue) throw new Error("value_unchanged");
    await addDoc(collection(db, "profile_change_requests"), {
      userId: user.uid,
      field,
      currentValue,
      requestedValue: trimmed,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      adminReason: "",
      userName: profile.displayName,
      userEmail: profile.email,
    });
  };

  /**
   * SUPER ADMIN ONLY — approve a pending profile change request.
   * Atomically:
   *   1. Updates users/{uid}.phone or .employeeNumber
   *   2. Creates the new uniqueness index document
   *   3. Deletes the old uniqueness index document
   *   4. Marks profile_change_requests/{id} as "approved"
   * If the requested value is already taken (!exists fails), throws "already_taken".
   */
  const approveProfileChange = async (
    changeRequestId: string,
    req: ProfileChangeRequest
  ) => {
    if (!isSuperAdmin) throw new Error("Not authorized");
    const now = serverTimestamp();
    const batch = writeBatch(db);

    if (req.field === "phone") {
      const newPhone = normalizePhone(req.requestedValue);
      const oldPhone = normalizePhone(req.currentValue);
      if (!newPhone) throw new Error("invalid_phone");
      batch.update(doc(db, "users", req.userId), { phone: newPhone, updatedAt: now });
      batch.set(doc(db, "user_phone_index", newPhone), {
        uid: req.userId,
        phone: newPhone,
        createdAt: now,
      });
      if (oldPhone) batch.delete(doc(db, "user_phone_index", oldPhone));
    } else {
      const newEmpNum = req.requestedValue.trim();
      const oldEmpNum = req.currentValue.trim();
      if (!newEmpNum) throw new Error("invalid_employee_number");
      batch.update(doc(db, "users", req.userId), { employeeNumber: newEmpNum, updatedAt: now });
      batch.set(doc(db, "user_employee_index", newEmpNum), {
        uid: req.userId,
        employeeNumber: newEmpNum,
        createdAt: now,
      });
      if (oldEmpNum) batch.delete(doc(db, "user_employee_index", oldEmpNum));
    }

    batch.update(doc(db, "profile_change_requests", changeRequestId), {
      status: "approved",
      updatedAt: now,
    });

    try {
      await batch.commit();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "permission-denied") throw new Error("already_taken");
      throw err;
    }
  };

  /**
   * SUPER ADMIN ONLY — reject a pending profile change request with a reason.
   */
  const rejectProfileChange = async (changeRequestId: string, reason: string) => {
    if (!isSuperAdmin) throw new Error("Not authorized");
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new Error("reason_required");
    await updateDoc(doc(db, "profile_change_requests", changeRequestId), {
      status: "rejected",
      adminReason: trimmedReason,
      updatedAt: serverTimestamp(),
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
        requestProfileChange,
        approveProfileChange,
        rejectProfileChange,
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
