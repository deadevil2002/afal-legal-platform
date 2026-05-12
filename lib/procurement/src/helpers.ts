import {
  VAT_RATE,
  PROCUREMENT_ROLES,
  BUDGET_APPROVAL_STEPS,
  PO_APPROVAL_STEPS,
} from "./constants";
import type {
  ProcurementRole,
  AnyRole,
  ApprovalStepRole,
  ApprovalChainType,
} from "./constants";

// ─── VAT Calculations ─────────────────────────────────────────────────────────

/**
 * Returns the VAT amount for a given price excluding VAT.
 * Result is rounded to 2 decimal places.
 */
export function calculateVat(
  priceExcludingVatSar: number,
  vatRate: number = VAT_RATE,
): number {
  return Math.round(priceExcludingVatSar * vatRate * 100) / 100;
}

/**
 * Returns the total price including VAT.
 * Result is rounded to 2 decimal places.
 */
export function calculatePriceIncludingVat(
  priceExcludingVatSar: number,
  vatRate: number = VAT_RATE,
): number {
  return Math.round(priceExcludingVatSar * (1 + vatRate) * 100) / 100;
}

// ─── Request Number ───────────────────────────────────────────────────────────

/**
 * Generates a human-readable request number.
 * Format: PRQ-{YYYY}-{sequence padded to 4 digits}
 * Example: PRQ-2026-0042
 */
export function generateRequestNumber(date: Date, sequence: number): string {
  const year = date.getFullYear();
  const seq = String(Math.abs(Math.floor(sequence))).padStart(4, "0");
  return `PRQ-${year}-${seq}`;
}

// ─── Role Utilities ───────────────────────────────────────────────────────────

/**
 * Returns true if the given string is a valid AF Procurement Hub role.
 * Does NOT include legacy roles ("user", "assistant_admin").
 */
export function isProcurementRole(role: string): role is ProcurementRole {
  return (PROCUREMENT_ROLES as readonly string[]).includes(role);
}

// ─── Approval Chain Utilities ─────────────────────────────────────────────────
//
// There are two approval chains:
//
//  "budget" (Stage 7):  planning(1) → finance(2) → evp/ceo(3, conditional)
//  "po"     (Stages 9-10): requester/director(1) → planning(2)
//
// Use the chain-specific helpers below instead of the old canRoleApproveStep.

/**
 * Returns true if the given role may sign the specified step in the
 * BUDGET approval chain (Stage 7).
 *
 * Step 1 → planning
 * Step 2 → finance
 * Step 3 → evp OR ceo (both accepted; step is conditional on requiresEVPCEO)
 *
 * @param role       The actor's role string.
 * @param stepOrder  Budget chain step number (1–3).
 */
export function canRoleApproveBudgetStep(
  role: AnyRole,
  stepOrder: number,
): boolean {
  const step = BUDGET_APPROVAL_STEPS.find((s) => s.order === stepOrder);
  if (!step) return false;
  // Step 3 accepts both evp and ceo
  if (step.role === "evp") return role === "evp" || role === "ceo";
  return role === step.role;
}

/**
 * Returns true if the given role (or "requester" sentinel) may sign the
 * specified step in the PO approval chain (Stages 9–10).
 *
 * Step 1 → "requester" sentinel (the user who created the RFQ, canSubmitRequests: true)
 * Step 2 → planning
 *
 * @param role       The actor's role string, or "requester" for step 1.
 * @param stepOrder  PO chain step number (1–2).
 */
export function canRoleApprovePOStep(
  role: AnyRole | "requester",
  stepOrder: number,
): boolean {
  const step = PO_APPROVAL_STEPS.find((s) => s.order === stepOrder);
  if (!step) return false;
  if (step.role === "requester") return role === "requester";
  return role === step.role;
}

/**
 * Generic approval step check — delegates to the correct chain helper.
 *
 * @param chainType  "budget" or "po"
 * @param role       The actor's role, or "requester" for PO chain step 1.
 * @param stepOrder  Step number within the given chain.
 */
export function canRoleApproveStep(
  chainType: ApprovalChainType,
  role: AnyRole | ApprovalStepRole,
  stepOrder: number,
): boolean {
  if (chainType === "budget") {
    return canRoleApproveBudgetStep(role as AnyRole, stepOrder);
  }
  return canRoleApprovePOStep(role as AnyRole | "requester", stepOrder);
}

/** Alias for backward compatibility with any existing callers */
export const canRoleApproveStage = canRoleApproveStep;
