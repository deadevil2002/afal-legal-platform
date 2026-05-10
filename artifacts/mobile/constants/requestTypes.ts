export const REQUEST_CATEGORIES = [
  "Purchase Request",
  "Vendor Approval",
  "Contract Review",
  "Budget Request",
  "Supplier Onboarding",
  "Violation Report",
] as const;

export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

export const CATEGORY_TRANSLATION_KEYS: Record<
  RequestCategory,
  | "typePurchaseRequest"
  | "typeVendorApproval"
  | "typeContractReview"
  | "typeBudgetRequest"
  | "typeSupplierOnboarding"
  | "typeViolationReport"
> = {
  "Purchase Request":    "typePurchaseRequest",
  "Vendor Approval":     "typeVendorApproval",
  "Contract Review":     "typeContractReview",
  "Budget Request":      "typeBudgetRequest",
  "Supplier Onboarding": "typeSupplierOnboarding",
  "Violation Report":    "typeViolationReport",
};
