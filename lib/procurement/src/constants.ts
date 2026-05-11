// ─── Procurement Roles ────────────────────────────────────────────────────────

export const PROCUREMENT_ROLES = [
  "super_admin",
  "ceo",
  "evp",
  "operations",
  "planning",
  "finance",
  "procurement",
] as const;

export type ProcurementRole = (typeof PROCUREMENT_ROLES)[number];

export const LEGACY_ROLES = ["user", "assistant_admin"] as const;
export type LegacyRole = (typeof LEGACY_ROLES)[number];

export type AnyRole = ProcurementRole | LegacyRole;

// ─── Procurement Categories ──────────────────────────────────────────────────

export const PROCUREMENT_CATEGORIES = [
  "Purchase Request",
  "Vendor Approval",
  "Contract Review",
  "Budget Request",
  "Supplier Onboarding",
  "Violation Report",
] as const;

export type ProcurementCategory = (typeof PROCUREMENT_CATEGORIES)[number];

// ─── Workflow Stages / Statuses ───────────────────────────────────────────────

export const PROCUREMENT_STAGES = [
  "draft",
  "pending_procurement",
  "awaiting_quotations",
  "quotations_received",
  "pending_director_review",
  "director_rejected",
  "director_approved",
  "pending_po",
  "pending_approvals",
  "pending_payment",
  "closed",
  "terminated",
] as const;

export type ProcurementStage = (typeof PROCUREMENT_STAGES)[number];

export const TERMINAL_STAGES: readonly ProcurementStage[] = [
  "closed",
  "terminated",
];

// Maps each stage string to its numeric step (1-9).
// "terminated" does not correspond to a numbered step.
export const STAGE_TO_STEP: Partial<Record<ProcurementStage, number>> = {
  draft: 1,
  pending_procurement: 1,
  awaiting_quotations: 2,
  quotations_received: 3,
  pending_director_review: 4,
  director_rejected: 5,
  director_approved: 5,
  pending_po: 6,
  pending_approvals: 7,
  pending_payment: 8,
  closed: 9,
};

// ─── Approval Chain ───────────────────────────────────────────────────────────
// Step 1: the original requester (any user with canSubmitRequests: true)
// Steps 2-5: system roles in order
// "requester" is a sentinel — it is NOT a ProcurementRole value.

export type ApprovalStepRole = ProcurementRole | "requester";

export const APPROVAL_CHAIN_STEPS = [
  { order: 1, role: "requester" as ApprovalStepRole, label: "Requester / Director" },
  { order: 2, role: "operations" as ApprovalStepRole, label: "Operations" },
  { order: 3, role: "planning" as ApprovalStepRole, label: "Planning" },
  { order: 4, role: "finance" as ApprovalStepRole, label: "Finance" },
  { order: 5, role: "evp" as ApprovalStepRole, label: "EVP / CEO (if required)" },
] as const;

// ─── Approval Status & Decision ───────────────────────────────────────────────

export const APPROVAL_STATUSES = ["pending", "approved", "skipped"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_DECISIONS = ["approved", "skipped"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

// ─── Supplier Payment Terms ───────────────────────────────────────────────────

export const PAYMENT_TERMS = ["advance", "50_50", "after_supply"] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  advance: "100% Advance",
  "50_50": "50% Advance / 50% After Supply",
  after_supply: "100% After Supply",
};

// ─── Workflow Event Types ─────────────────────────────────────────────────────

export const WORKFLOW_EVENT_TYPES = [
  "request_created",
  "sent_to_procurement",
  "supplier_link_generated",
  "supplier_link_deactivated",
  "supplier_response_received",
  "quotations_forwarded",
  "director_approved",
  "director_rejected",
  "po_added",
  "approval_granted",
  "approval_skipped",
  "payment_recorded",
  "request_closed",
  "request_terminated",
  "workflow_rerouted",
  "comment_added",
] as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

// ─── Payment Status ───────────────────────────────────────────────────────────

export const PAYMENT_STATUSES = ["pending", "recorded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ─── Supplier Response Review Status ─────────────────────────────────────────

export const SUPPLIER_REVIEW_STATUSES = [
  "pending",
  "forwarded",
  "selected",
  "rejected",
] as const;

export type SupplierReviewStatus = (typeof SUPPLIER_REVIEW_STATUSES)[number];

// ─── VAT ──────────────────────────────────────────────────────────────────────

export const VAT_RATE = 0.15;
