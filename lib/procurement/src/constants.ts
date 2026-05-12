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
//
// The confirmed RFQ-first flow has 12 numbered stages plus "terminated".
//
//  1  draft                        RFQ created by requester; not yet submitted
//  2  pending_procurement           Submitted to Procurement; awaiting supplier outreach
//  3  awaiting_quotations           Supplier links generated; waiting for responses
//  4  quotations_received           At least one response in; Procurement reviewing/forwarding
//  5  pending_requester_selection   Forwarded to requester to select a quotation
//  5b quotation_rejected            Requester rejected all quotations; Procurement re-collects
//  6  pending_pr_entry              Requester enters PR number + approved budget in SAR
//  7  pending_budget_approval       Budget approval chain in progress (Planning→Finance→EVP/CEO)
//  8  pending_po                    Budget approved; Procurement entering SAP PO/PR details
//  9  pending_director_po_approval  PO entered; Director approving the PO
// 10  pending_planning_po_approval  Director approved; Planning approving the PO
// 11  pending_payment               Planning approved; Finance payment + proof upload
// 12  closed                        Procurement closed; request fully archived
//  —  terminated                   Super Admin terminated

export const PROCUREMENT_STAGES = [
  "draft",
  "pending_procurement",
  "awaiting_quotations",
  "quotations_received",
  "pending_requester_selection",
  "quotation_rejected",
  "pending_pr_entry",
  "pending_budget_approval",
  "pending_po",
  "pending_director_po_approval",
  "pending_planning_po_approval",
  "pending_payment",
  "closed",
  "terminated",
] as const;

export type ProcurementStage = (typeof PROCUREMENT_STAGES)[number];

export const TERMINAL_STAGES: readonly ProcurementStage[] = [
  "closed",
  "terminated",
];

// Maps each stage string to its numeric step (1–12).
// "terminated" and "quotation_rejected" do not advance the step counter;
// they are sub-states within stage 5 or a forced stop.
export const STAGE_TO_STEP: Partial<Record<ProcurementStage, number>> = {
  draft: 1,
  pending_procurement: 2,
  awaiting_quotations: 3,
  quotations_received: 4,
  pending_requester_selection: 5,
  quotation_rejected: 5,          // rejection sub-state; still within step 5
  pending_pr_entry: 6,
  pending_budget_approval: 7,
  pending_po: 8,
  pending_director_po_approval: 9,
  pending_planning_po_approval: 10,
  pending_payment: 11,
  closed: 12,
};

// ─── Approval Chains ─────────────────────────────────────────────────────────
//
// There are TWO distinct approval chains in the workflow:
//
//  BUDGET_APPROVAL_CHAIN (Stage 7) — runs BEFORE the PO is created in SAP.
//  Approvers confirm that budget exists and is authorised.
//  Steps: planning(1) → finance(2) → evp_or_ceo(3, conditional on requiresEVPCEO)
//
//  PO_APPROVAL_CHAIN (Stages 9–10) — runs AFTER Procurement enters PO details.
//  Approvers sign off that the PO matches what was agreed.
//  Steps: director/requester(1) → planning(2)
//
// "requester" is a sentinel used for Step 1 of the PO chain — it means
// "the user who created the RFQ" (canSubmitRequests: true), not a role value.

export type ApprovalStepRole = ProcurementRole | "requester";

export type ApprovalChainType = "budget" | "po";

export const BUDGET_APPROVAL_STEPS = [
  { order: 1, role: "planning" as ApprovalStepRole, label: "Planning" },
  { order: 2, role: "finance" as ApprovalStepRole, label: "Finance" },
  {
    order: 3,
    role: "evp" as ApprovalStepRole,
    label: "EVP / CEO (if required)",
    conditional: true,
  },
] as const;

export const PO_APPROVAL_STEPS = [
  {
    order: 1,
    role: "requester" as ApprovalStepRole,
    label: "Director / Requester",
  },
  { order: 2, role: "planning" as ApprovalStepRole, label: "Planning" },
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
  // Stage 1-2
  "request_created",           // Requester submits RFQ
  "sent_to_procurement",       // Status moves to pending_procurement

  // Stage 3
  "supplier_link_generated",   // Procurement creates a supplier form link
  "supplier_link_deactivated", // Procurement deactivates a link before response

  // Stage 4
  "supplier_response_received", // Supplier submits quotation via public form
  "quotations_forwarded",       // Procurement forwards responses to requester

  // Stage 5
  "quotation_selected",         // Requester selects (approves) a supplier response
  "quotation_rejected",         // Requester rejects all responses; back to Procurement

  // Stage 6
  "pr_budget_entered",          // Requester enters PR number + approved budget

  // Stage 7 — budget approval chain
  "budget_approval_granted",    // A budget-chain approver (planning/finance/evp/ceo) signs off
  "budget_approval_skipped",    // A conditional budget-chain step skipped (EVP/CEO not required)

  // Stage 8
  "po_added",                   // Procurement enters SAP PO number + attachment

  // Stage 9
  "po_director_approved",       // Director (requester) approves the PO

  // Stage 10
  "po_planning_approved",       // Planning approves the PO

  // Stage 11
  "payment_recorded",           // Finance records payment + uploads proof

  // Stage 12
  "request_closed",             // Procurement marks request closed

  // Super Admin
  "request_terminated",         // Super Admin terminates
  "workflow_rerouted",          // Super Admin manually reroutes to a different stage

  // General
  "comment_added",              // Any actor adds a free-text comment
] as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

// ─── Payment Status ───────────────────────────────────────────────────────────

export const PAYMENT_STATUSES = ["pending", "recorded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ─── Supplier Response Review Status ─────────────────────────────────────────
//
// Tracks Procurement's review of each supplier response before forwarding.
//
//  pending   — just received; not yet reviewed by Procurement
//  forwarded — included in the set forwarded to the requester
//  selected  — the one the requester chose to approve
//  rejected  — explicitly rejected (either by Procurement or by requester)

export const SUPPLIER_REVIEW_STATUSES = [
  "pending",
  "forwarded",
  "selected",
  "rejected",
] as const;

export type SupplierReviewStatus = (typeof SUPPLIER_REVIEW_STATUSES)[number];

// ─── VAT ──────────────────────────────────────────────────────────────────────

export const VAT_RATE = 0.15;
