export type UserRole =
  | "super_admin"
  | "ceo"
  | "evp"
  | "operations"
  | "planning"
  | "finance"
  | "procurement";

export type LegacyRole = "user" | "assistant_admin";

export type AnyUserRole = UserRole | LegacyRole;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  fullName?: string;
  employeeNumber?: string;
  role: AnyUserRole;
  canSubmitRequests?: boolean;
  department?: string;
  phone?: string;
  mobileNumber?: string;
  isActive?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  language?: "en" | "ar";
}

export interface ProcurementRequest {
  id: string;
  status: string;
  category: string;
  createdByUid: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  prNumber?: string;
  budgetAmount?: number;
}

export interface AppSettings {
  superAdminEmail: string;
  previousSuperAdminEmail?: string;
  superAdminTransferredAt?: unknown;
}

export const ROLE_LABELS: Record<AnyUserRole, string> = {
  super_admin:    "Super Admin",
  ceo:            "CEO",
  evp:            "EVP",
  operations:     "Operations",
  planning:       "Planning",
  finance:        "Finance",
  procurement:    "Procurement",
  assistant_admin: "Admin (Legacy)",
  user:           "User (Legacy)",
};

export const ROLE_COLORS: Record<AnyUserRole, string> = {
  super_admin:    "#BC9B5D",
  ceo:            "#7C3AED",
  evp:            "#5D1E5E",
  operations:     "#B45309",
  planning:       "#006485",
  finance:        "#16A8BA",
  procurement:    "#2D6491",
  assistant_admin: "#6B7280",
  user:           "#9CA3AF",
};
