export type ProcurementStageKey =
  | "draft"
  | "pending_procurement"
  | "awaiting_quotations"
  | "quotations_received"
  | "pending_requester_selection"
  | "quotation_rejected"
  | "pending_pr_entry"
  | "pending_budget_approval"
  | "pending_po"
  | "pending_director_po_approval"
  | "pending_planning_po_approval"
  | "pending_payment"
  | "closed"
  | "terminated";

export interface ProcurementStageConfig {
  labelKey: string;
  bg: string;
  fg: string;
  step: number;
}

export const PROCUREMENT_STAGE_CONFIG: Record<string, ProcurementStageConfig> = {
  draft: {
    labelKey: "stageDraft",
    bg: "#F3F4F6",
    fg: "#374151",
    step: 1,
  },
  pending_procurement: {
    labelKey: "stagePendingProcurement",
    bg: "#DBEAFE",
    fg: "#1E40AF",
    step: 2,
  },
  awaiting_quotations: {
    labelKey: "stageAwaitingQuotations",
    bg: "#E0F2FE",
    fg: "#006485",
    step: 3,
  },
  quotations_received: {
    labelKey: "stageQuotationsReceived",
    bg: "#FEF9C3",
    fg: "#854D0E",
    step: 4,
  },
  pending_requester_selection: {
    labelKey: "stagePendingRequesterSelection",
    bg: "#FFF7ED",
    fg: "#C2410C",
    step: 5,
  },
  quotation_rejected: {
    labelKey: "stageQuotationRejected",
    bg: "#FEE2E2",
    fg: "#991B1B",
    step: 5,
  },
  pending_pr_entry: {
    labelKey: "stagePendingPREntry",
    bg: "#F3E8FF",
    fg: "#7C3AED",
    step: 6,
  },
  pending_budget_approval: {
    labelKey: "stagePendingBudgetApproval",
    bg: "#FEF9C3",
    fg: "#854D0E",
    step: 7,
  },
  pending_po: {
    labelKey: "stagePendingPO",
    bg: "#E0F2FE",
    fg: "#006485",
    step: 8,
  },
  pending_director_po_approval: {
    labelKey: "stagePendingDirectorPOApproval",
    bg: "#F5E8FF",
    fg: "#5D1E5E",
    step: 9,
  },
  pending_planning_po_approval: {
    labelKey: "stagePendingPlanningPOApproval",
    bg: "#F3E8FF",
    fg: "#6B21A8",
    step: 10,
  },
  pending_payment: {
    labelKey: "stagePendingPayment",
    bg: "#FEF9C3",
    fg: "#854D0E",
    step: 11,
  },
  closed: {
    labelKey: "stageClosed",
    bg: "#DCFCE7",
    fg: "#166534",
    step: 12,
  },
  terminated: {
    labelKey: "stageTerminated",
    bg: "#FEE2E2",
    fg: "#991B1B",
    step: 0,
  },
  planning_review: {
    labelKey: "stagePlanningReview",
    bg: "#FEF3C7",
    fg: "#92400E",
    step: 7,
  },
  finance_review: {
    labelKey: "stageFinanceReview",
    bg: "#FEF3C7",
    fg: "#92400E",
    step: 7,
  },
  evp_review: {
    labelKey: "stageEVPReview",
    bg: "#FEF3C7",
    fg: "#92400E",
    step: 7,
  },
  ceo_review: {
    labelKey: "stageCEOReview",
    bg: "#FEF3C7",
    fg: "#92400E",
    step: 7,
  },
  approved: {
    labelKey: "stageApproved",
    bg: "#DCFCE7",
    fg: "#166534",
    step: 12,
  },
  planning_rejected: {
    labelKey: "stagePlanningRejected",
    bg: "#FEE2E2",
    fg: "#991B1B",
    step: 7,
  },
  finance_rejected: {
    labelKey: "stageFinanceRejected",
    bg: "#FEE2E2",
    fg: "#991B1B",
    step: 7,
  },
  evp_rejected: {
    labelKey: "stageEVPRejected",
    bg: "#FEE2E2",
    fg: "#991B1B",
    step: 7,
  },
  ceo_rejected: {
    labelKey: "stageCEORejected",
    bg: "#FEE2E2",
    fg: "#991B1B",
    step: 7,
  },
};

const DEFAULT_STAGE_CONFIG: ProcurementStageConfig = {
  labelKey: "stageDraft",
  bg: "#F3F4F6",
  fg: "#374151",
  step: 0,
};

export function getStageBadgeConfig(stage: string): ProcurementStageConfig {
  return PROCUREMENT_STAGE_CONFIG[stage] ?? DEFAULT_STAGE_CONFIG;
}

export const TERMINAL_PROCUREMENT_STAGES: readonly string[] = ["closed", "terminated", "approved"];

export function isProcurementTerminal(stage: string): boolean {
  return TERMINAL_PROCUREMENT_STAGES.includes(stage);
}
