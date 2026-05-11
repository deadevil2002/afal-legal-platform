import {
  VAT_RATE,
  PROCUREMENT_ROLES,
  APPROVAL_CHAIN_STEPS,
} from "./constants";
import type { ProcurementRole, AnyRole } from "./constants";

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

/**
 * Returns true if the given role is allowed to sign the specified approval
 * chain step.
 *
 * Step 1 → "requester"  (the user who created the request, canSubmitRequests: true)
 * Step 2 → "operations"
 * Step 3 → "planning"
 * Step 4 → "finance"
 * Step 5 → "evp" or "ceo" (both accepted for step 5)
 *
 * @param role   The actor's role string, or "requester" for the step-1 sentinel.
 * @param stepOrder  Approval chain step number (1–5).
 */
export function canRoleApproveStep(
  role: AnyRole | "requester",
  stepOrder: number,
): boolean {
  const step = APPROVAL_CHAIN_STEPS.find((s) => s.order === stepOrder);
  if (!step) return false;
  if (step.role === "requester") return role === "requester";
  // Step 5 accepts both evp and ceo
  if (step.role === "evp") return role === "evp" || role === "ceo";
  return role === step.role;
}

/** Alias matching the name used in AF_PROCUREMENT_WORKFLOW_SPEC.md */
export const canRoleApproveStage = canRoleApproveStep;
