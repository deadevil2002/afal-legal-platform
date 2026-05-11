export const REQUEST_STATUSES = [
  "Submitted",
  "Under Review",
  "CEO Review",
  "EVP Review",
  "Planning Review",
  "Finance Review",
  "Approved / PO Issued",
  "Rejected",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const TERMINAL_STATUSES: RequestStatus[] = [
  "Approved / PO Issued",
  "Rejected",
];

export const STATUS_TRANSLATION_KEYS: Record<
  RequestStatus,
  | "statusSubmitted"
  | "statusUnderReview"
  | "statusCEOReview"
  | "statusEVPReview"
  | "statusPlanningReview"
  | "statusFinanceReview"
  | "statusApprovedPOIssued"
  | "statusRejected"
> = {
  "Submitted":            "statusSubmitted",
  "Under Review":         "statusUnderReview",
  "CEO Review":           "statusCEOReview",
  "EVP Review":           "statusEVPReview",
  "Planning Review":      "statusPlanningReview",
  "Finance Review":       "statusFinanceReview",
  "Approved / PO Issued": "statusApprovedPOIssued",
  "Rejected":             "statusRejected",
};
