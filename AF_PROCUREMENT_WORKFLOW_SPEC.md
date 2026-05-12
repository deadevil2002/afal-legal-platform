# AF Procurement Hub — Workflow Specification
**Version**: 1.2  
**Status**: Approved — RFQ-first flow confirmed  
**Date**: 2026-05-12  
**Changes in 1.1**: `operations` added as a first-class role; role permissions table reordered; approval chain updated; Risk 6 resolved.  
**Changes in 1.2**: Full RFQ-first rewrite. Stage count 9 → 12. Two distinct approval chains (budget + PO). Stage 5 (select quotation) and Stage 6 (enter PR/budget) split into separate stages. `operations` removed from all approval chains. New statuses: `pending_requester_selection`, `quotation_rejected`, `pending_pr_entry`, `pending_budget_approval`, `pending_director_po_approval`, `pending_planning_po_approval`. Old statuses `director_rejected`, `director_approved`, `pending_director_review` removed. Model updated: `approval.chainType`, `quotationRejectedAt`/`quotationRejectionReason`, `createdByRole` added.

---

## 1. Workflow Summary

The procurement lifecycle starts with an RFQ from the requester, moves through Procurement-managed supplier quotation collection, requester selection and budget entry, two sequential approval chains, PO creation, and finance payment before Procurement closes the request. Every state transition is logged as an immutable event so the full timeline is always auditable.

```
[Any user with canSubmitRequests: true — "the requester / Director"]
        │
        ▼  Stage 1: RFQ Created  (status: draft)
           Requester describes what they need and submits to Procurement.
[role: procurement]
        │
        ▼  Stage 2: Procurement Receives Request  (status: pending_procurement)
           Procurement reviews the RFQ and begins supplier outreach.
        │
        ▼  Stage 3: Supplier Links Generated  (status: awaiting_quotations)
           Procurement generates one public form link per supplier (min 3 supported,
           "Add more" available). Each link is unguessable and can be deactivated.
[Suppliers — public form, no login required]
        │
        ▼  Stage 4: Supplier Quotations Received  (status: quotations_received)
           Suppliers submit their quotation forms (company info, price excl. VAT,
           VAT auto-calculated at 15%, payment terms). Procurement reviews and
           forwards the set to the requester.
[canSubmitRequests: true user — "the requester / Director"]
        │
        ▼  Stage 5: Requester Selects Quotation  (status: pending_requester_selection)
           Requester views all forwarded supplier quotations and either:
           ├─ Selects one  →  (status: pending_pr_entry)
           └─ Rejects all  →  (status: quotation_rejected) back to Procurement
                                for a new round of supplier links
        │
        ▼  Stage 6: Requester Enters PR Number + Approved Budget  (status: pending_pr_entry)
           After selecting a quotation, the requester enters the SAP PR number
           and the approved budget in SAR.
[Budget Approval Chain — sequential]
        │
        ▼  Stage 7: Budget Approvals  (status: pending_budget_approval)
           Three approvers confirm budget availability and authorisation:
           │  1. role: planning  ✓
           │  2. role: finance   ✓
           │  3. role: evp or ceo  ✓  (only if requiresEVPCEO == true)
           All required steps must be completed before moving to Stage 8.
[role: procurement]
        │
        ▼  Stage 8: Procurement Enters PO Details  (status: pending_po)
           Procurement creates the PO in SAP (outside the app), then enters the
           SAP PO number and uploads the PO attachment in the app.
[PO Approval Chain — sequential]
        │
        ▼  Stage 9: Director Approves PO  (status: pending_director_po_approval)
           The original requester (Director) reviews and approves the PO document.
        │
        ▼  Stage 10: Planning Approves PO  (status: pending_planning_po_approval)
           Planning gives final sign-off on the PO.
[role: finance]
        │
        ▼  Stage 11: Finance Payment  (status: pending_payment)
           Finance processes payment in SAP and uploads the payment proof
           (reference number + attachment) in the app.
[role: procurement]
        │
        ▼  Stage 12: Request Closed  (status: closed)
           Procurement confirms closure. A unique request number (PRQ-YYYY-XXXX)
           is assigned and the full timeline is archived.
```

---

## 2. Data Model Proposal

### 2.1 `procurement_requests` (top-level collection)

The primary document for each request. Replaces the current `requests` collection for new workflow records.

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto Firestore ID |
| `requestNumber` | string \| null | Human-readable unique ID (e.g. `PRQ-2026-0042`) — set on closure |
| `createdByUid` | string | UID of the requester |
| `createdByName` | string | Display name snapshot |
| `createdByRole` | string | Role snapshot at time of creation |
| `createdByEmployeeNumber` | string | Employee number snapshot |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |
| `currentStage` | number | Numeric step 1–12 (derived from `status`, stored for queries) |
| `status` | string | Canonical workflow state string (see §4) |
| `category` | string | One of 6 procurement categories |
| `productDescription` | string | RFQ body — what is being procured |
| `requestAttachments` | AttachmentRef[] | Specs, drawings, etc. |
| `selectedSupplierResponseId` | string \| null | Set at Stage 5 when requester selects a quotation |
| `quotationRejectedAt` | timestamp \| null | Set at Stage 5 if requester rejects all quotations |
| `quotationRejectionReason` | string \| null | Requester's written rejection reason |
| `prNumber` | string \| null | SAP PR number — entered by requester at Stage 6 |
| `approvedBudgetSar` | number \| null | Approved budget in SAR — entered by requester at Stage 6 |
| `poNumber` | string \| null | SAP PO number — entered by Procurement at Stage 8 |
| `poAttachment` | AttachmentRef \| null | PO document — uploaded at Stage 8 |
| `requiresEVPCEO` | boolean | Whether budget chain step 3 (EVP/CEO) is required |
| `paymentStatus` | string | `"pending"` \| `"recorded"` |
| `showFullWorkflow` | boolean | If true, requester sees the full timeline |
| `isActive` | boolean | False when closed or terminated |
| `isTerminated` | boolean | Set by Super Admin |
| `terminatedBy` | string \| null | UID of Super Admin who terminated |
| `terminationReason` | string \| null | |
| `terminatedAt` | timestamp \| null | |
| `closedAt` | timestamp \| null | Set at Stage 12 |
| `closedBy` | string \| null | UID of Procurement user who closed |

**AttachmentRef sub-type:**
```
{ url: string, name: string, storagePath: string, uploadedAt: timestamp, uploadedBy: string }
```

---

### 2.2 `supplier_links` (top-level collection)

One document per supplier form link generated by Procurement.

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto Firestore ID = the public token in the link |
| `requestId` | string | Parent `procurement_requests` doc ID |
| `createdBy` | string | UID of Procurement user who generated the link |
| `createdAt` | timestamp | |
| `expiresAt` | timestamp \| null | Optional expiry |
| `label` | string \| null | Optional label (e.g. "Supplier A") |
| `isActive` | boolean | Set to false to invalidate the link |
| `responseId` | string \| null | Set when a supplier submits; FK to `supplier_responses` |

---

### 2.3 `supplier_responses` (top-level collection)

One document per supplier form submission. Written by the public API route (no Firebase auth).

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto Firestore ID |
| `linkId` | string | FK to `supplier_links` |
| `requestId` | string | FK to `procurement_requests` |
| `submittedAt` | timestamp | |
| `companyName` | string | |
| `crNumber` | string | Commercial Registration number |
| `crAttachment` | AttachmentRef | |
| `sacNumber` | string | Saudi Accreditation Center number |
| `sacAttachment` | AttachmentRef | |
| `zatcaNumber` | string | ZATCA / Zakat Customs number |
| `phone` | string | |
| `email` | string | |
| `contactPerson` | string | |
| `nationalAddress` | string | Written address |
| `nationalAddressAttachment` | AttachmentRef | |
| `iban` | string | |
| `ibanAttachment` | AttachmentRef | |
| `priceExcludingVAT` | number | SAR |
| `priceIncludingVAT` | number | Calculated: priceExcludingVAT × 1.15 |
| `paymentTerms` | string | `"advance"` \| `"50_50"` \| `"after_supply"` |
| `notes` | string \| null | |
| `extraAttachments` | AttachmentRef[] | |
| `reviewStatus` | string | `"pending"` \| `"forwarded"` \| `"selected"` \| `"rejected"` |
| `reviewedBy` | string \| null | UID of Procurement reviewer |
| `reviewedAt` | timestamp \| null | |

---

### 2.4 `workflow_events` (top-level collection)

Immutable log of every stage transition and comment. Never updated or deleted (except by Super Admin force-delete).

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto Firestore ID |
| `requestId` | string | FK to `procurement_requests` |
| `type` | string | Event type (see below) |
| `actorUid` | string \| null | UID of the person who triggered it (null for system events) |
| `actorName` | string \| null | Display name snapshot |
| `actorRole` | string \| null | Role snapshot |
| `createdAt` | timestamp | |
| `fromStatus` | string \| null | Previous workflow status |
| `toStatus` | string \| null | New workflow status |
| `comment` | string \| null | Human-readable note attached to this event |
| `metadata` | map \| null | Extra data for the event type (e.g. `{ supplierLinkId, poNumber }`) |

**Event types (v1.2):**

| Type | Fired at |
|---|---|
| `request_created` | Stage 1 — RFQ submitted |
| `sent_to_procurement` | Stage 1→2 — status moves to pending_procurement |
| `supplier_link_generated` | Stage 3 — Procurement generates a link |
| `supplier_link_deactivated` | Stage 3 — Procurement deactivates a link |
| `supplier_response_received` | Stage 4 — Supplier submits via public form |
| `quotations_forwarded` | Stage 4→5 — Procurement forwards to requester |
| `quotation_selected` | Stage 5→6 — Requester selects a supplier response |
| `quotation_rejected` | Stage 5→quotation_rejected — Requester rejects all |
| `pr_budget_entered` | Stage 6→7 — Requester enters PR number + approved budget |
| `budget_approval_granted` | Stage 7 — A budget-chain approver signs off |
| `budget_approval_skipped` | Stage 7 — Conditional EVP/CEO step skipped |
| `po_added` | Stage 8 — Procurement enters SAP PO number + attachment |
| `po_director_approved` | Stage 9 — Director (requester) approves the PO |
| `po_planning_approved` | Stage 10 — Planning approves the PO |
| `payment_recorded` | Stage 11 — Finance records payment + proof |
| `request_closed` | Stage 12 — Procurement closes |
| `request_terminated` | — Super Admin terminates |
| `workflow_rerouted` | — Super Admin manually reroutes stage |
| `comment_added` | Any stage — free-text comment |

---

### 2.5 `approvals` (top-level collection)

One document per approver step per request. Two chains are created at different workflow stages.

**Budget chain** (Stage 7 — created when requester submits PR + budget at Stage 6):

| stepOrder | approverRole | Conditional |
|---|---|---|
| 1 | `planning` | always |
| 2 | `finance` | always |
| 3 | `evp` (or `ceo`) | only if `requiresEVPCEO == true` |

**PO chain** (Stages 9–10 — created when Procurement enters PO at Stage 8):

| stepOrder | approverRole | Conditional |
|---|---|---|
| 1 | `requester` (sentinel) | always — the original requester (Director) |
| 2 | `planning` | always |

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto Firestore ID |
| `requestId` | string | FK to `procurement_requests` |
| `chainType` | string | `"budget"` \| `"po"` — identifies which chain |
| `stepOrder` | number | Position within the chain (1-based) |
| `approverRole` | string | Role responsible; `"requester"` sentinel for PO chain step 1 |
| `approverUid` | string \| null | UID of the user who acted (null until acted) |
| `status` | string | `"pending"` \| `"approved"` \| `"skipped"` |
| `decision` | string \| null | `"approved"` \| `"skipped"` — null while pending |
| `comment` | string \| null | Optional note attached to the decision |
| `decidedAt` | timestamp \| null | |
| `createdAt` | timestamp | |

---

### 2.6 `payment_records` (top-level collection)

One document per payment update. Allows multiple partial payments if needed.

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto Firestore ID |
| `requestId` | string | FK to `procurement_requests` |
| `reference` | string | Payment / invoice / reference number |
| `attachment` | AttachmentRef | |
| `notes` | string \| null | |
| `recordedBy` | string | UID of Finance user |
| `recordedAt` | timestamp | |

---

## 3. Role Permissions Table

Columns are the 7 system roles in rank order. The **canSubmitRequests** column is a permission flag, not a role — any user with any role may hold it.

| Action | super_admin | ceo | evp | operations | planning | finance | procurement | +canSubmitRequests |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create RFQ (Stage 1) | ✓ | — | — | — | — | — | — | ✓ |
| View own request | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View all requests | ✓ | — | — | — | — | — | ✓ | — |
| Generate supplier links (Stage 3) | ✓ | — | — | — | — | — | ✓ | — |
| View raw supplier responses | ✓ | — | — | — | — | — | ✓ | — |
| View forwarded quotations (Stage 5) | ✓ | — | — | — | — | — | ✓ | ✓† |
| Forward quotations to requester | ✓ | — | — | — | — | — | ✓ | — |
| Select / reject quotation (Stage 5) | ✓ | — | — | — | — | — | — | ✓ |
| Enter PR number + approved budget (Stage 6) | ✓ | — | — | — | — | — | — | ✓ |
| Budget chain — Planning sign-off (Stage 7, step 1) | ✓ | — | — | — | ✓ | — | — | — |
| Budget chain — Finance sign-off (Stage 7, step 2) | ✓ | — | — | — | — | ✓ | — | — |
| Budget chain — EVP/CEO sign-off (Stage 7, step 3) | ✓ | ✓ | ✓ | — | — | — | — | — |
| Enter PO details (Stage 8) | ✓ | — | — | — | — | — | ✓ | — |
| PO chain — Director sign-off (Stage 9) | ✓ | — | — | — | — | — | — | ✓ (requester) |
| PO chain — Planning sign-off (Stage 10) | ✓ | — | — | — | ✓ | — | — | — |
| Record payment + upload proof (Stage 11) | ✓ | — | — | — | — | ✓ | — | — |
| Close request (Stage 12) | ✓ | — | — | — | — | — | ✓ | — |
| View full timeline | ✓ | — | — | — | — | — | ✓ | if showFullWorkflow |
| Terminate / reroute request | ✓ | — | — | — | — | — | — | — |
| Manage users / roles / canSubmitRequests | ✓ | — | — | — | — | — | — | — |

† Requester sees **forwarded** quotations only — not the raw unreviewed supplier responses.

> **Note on "operations" role**: `operations` is a valid system role and may hold `canSubmitRequests: true`, but it has no dedicated approval chain step in the current workflow. Operations users participate as requesters (via the flag) or as viewers of their own requests.

> **Note on "Director"**: "Director" is used in workflow descriptions as a shorthand for the person who initiated the request. It is **not** a role value in the system. Any user — regardless of their role — who holds `canSubmitRequests: true` may create requests and perform Stage 5 quotation approval. If a dedicated Director role is required in the future it will be added as a new `UserRole` value; for now the permission flag is the sole gate.

---

## 4. Workflow Statuses

| Status | Stage | Owner Role | Description |
|---|---|---|---|
| `draft` | 1 | requester | RFQ created; not yet submitted to Procurement |
| `pending_procurement` | 2 | procurement | Submitted to Procurement; awaiting supplier outreach |
| `awaiting_quotations` | 3 | procurement | Supplier form links generated; waiting for responses |
| `quotations_received` | 4 | procurement | At least one response in; Procurement reviewing and forwarding |
| `pending_requester_selection` | 5 | requester | Quotations forwarded; requester must select one or reject all |
| `quotation_rejected` | 5b | procurement | Requester rejected all quotations; Procurement re-collects |
| `pending_pr_entry` | 6 | requester | Quotation selected; requester entering PR number + approved budget |
| `pending_budget_approval` | 7 | planning → finance → evp/ceo | Budget approval chain in progress |
| `pending_po` | 8 | procurement | Budget approved; Procurement entering SAP PO details |
| `pending_director_po_approval` | 9 | requester (director) | PO entered; requester approving the PO |
| `pending_planning_po_approval` | 10 | planning | Director approved PO; Planning signing off |
| `pending_payment` | 11 | finance | All PO approvals done; Finance processing payment |
| `closed` | 12 | — | Request completed and archived |
| `terminated` | — | super_admin | Stopped by Super Admin at any stage |

---

## 5. Required Fields per Stage

### Stage 1 — RFQ Creation (`draft`)
- `productDescription` (required) — what the requester needs to procure
- `category` (required) — one of the 6 procurement categories
- `requestAttachments` (optional at creation; Procurement may request before forwarding)
- `createdByRole` — snapshot of requester's role at time of creation

### Stage 3 — Supplier Links (`awaiting_quotations`)
- At least one `supplier_links` document created per round
- `label` (recommended) — e.g. "Supplier A", "Supplier B"
- System supports **3+ links per request** with an "Add more" option
- Each token is cryptographically random (64-char hex, never auto-increment)

### Stage 4 — Supplier Form Submission (public, no login)
Required fields on submission:

| Field | Notes |
|---|---|
| `companyName` | |
| `commercialRegistrationNumber` | |
| `commercialRegistrationAttachment` | file upload |
| `accreditationNumber` | SAC number |
| `accreditationAttachment` | file upload |
| `zatcaNumber` | ZATCA / Zakat Customs number |
| `phone` | |
| `email` | |
| `contactPersonName` | |
| `nationalAddressText` | |
| `nationalAddressAttachment` | file upload |
| `ibanText` | |
| `ibanAttachment` | file upload |
| `priceExcludingVatSar` | SAR; VAT auto-calculated server-side (× 1.15) |
| `paymentTerms` | `"advance"` · `"50_50"` · `"after_supply"` |

Optional: `notes`, `extraAttachments[]` (supports multiple additional files)

`vatAmountSar` and `priceIncludingVatSar` are **always computed server-side** — never trusted from the form payload.

### Stage 5 — Requester Selects Quotation (`pending_requester_selection`)
- Requester sees all **forwarded** supplier responses (not unreviewed raw submissions)
- Must select **exactly one** response OR reject all with a written reason
- On selection: `selectedSupplierResponseId` set on the request; status → `pending_pr_entry`
- On rejection: `quotationRejectedAt` + `quotationRejectionReason` set; status → `quotation_rejected`

### Stage 6 — Requester Enters PR + Budget (`pending_pr_entry`)
- `prNumber` (required) — SAP Purchase Requisition number
- `approvedBudgetSar` (required) — approved budget in SAR (positive number)
- Both entered by the requester (Director) who selected the quotation
- On completion: status → `pending_budget_approval`; budget approval chain documents created

### Stage 7 — Budget Approval Chain (`pending_budget_approval`)
Sequential approvals by:
1. `planning` — confirms budget is available in the plan
2. `finance` — confirms financial authorisation
3. `evp` or `ceo` — required only if `requiresEVPCEO == true`

Each step creates one `approvals` document (`chainType: "budget"`).
On all required steps approved: status → `pending_po`

### Stage 8 — Procurement Enters PO Details (`pending_po`)
- `poNumber` (required) — SAP PO number (created by Procurement outside the app)
- `poAttachment` (required) — uploaded PO document
- `requiresEVPCEO` — set here if not already determined (gates budget chain step 3)
- On completion: two `approvals` documents created (`chainType: "po"`); status → `pending_director_po_approval`

### Stage 9 — Director Approves PO (`pending_director_po_approval`)
- The original requester (Director) reviews the PO document
- Approves or comments; `approvals` doc (`chainType: "po"`, `stepOrder: 1`) updated
- On approval: status → `pending_planning_po_approval`

### Stage 10 — Planning Approves PO (`pending_planning_po_approval`)
- Planning gives final sign-off on the PO
- `approvals` doc (`chainType: "po"`, `stepOrder: 2`) updated
- On approval: status → `pending_payment`

### Stage 11 — Finance Payment (`pending_payment`)
- Finance processes payment in SAP (outside the app)
- `paymentReference` (required) — invoice / reference number
- `paymentAttachment` (required) — payment proof upload
- Creates a `payment_records` document
- On completion: status → `closed` (pending Procurement confirmation) or directly closed

### Stage 12 — Closure (`closed`)
- Procurement confirms closure
- `requestNumber` assigned (e.g. `PRQ-2026-XXXX`)
- `closedAt` and `closedBy` set
- Request archived; `isActive: false`

---

## 6. Firestore Security Rule Implications

### New collections required
| Collection | Read | Write | Notes |
|---|---|---|---|
| `procurement_requests` | owner + procurement + approvers + super_admin | owner (create), procurement (update by stage), super_admin (all) | Stage-gated writes need server-side function or careful affectedKeys validation |
| `supplier_links` | procurement + super_admin | procurement (create/deactivate), super_admin | Public link token never stored in readable client path |
| `supplier_responses` | procurement + director + super_admin | public API only (no auth) | Supplier submits via backend API route; Firestore rule: `allow write: if false` for direct client writes |
| `workflow_events` | owner (if showFullWorkflow) + procurement + super_admin | create only (append-only by role), never update/delete | `allow update, delete: if false` |
| `approvals` | assigned approver + procurement + super_admin | create by system/procurement, update by assigned approver only | |
| `payment_records` | finance + procurement + super_admin | finance (create only) | |

### Key rule design decisions
1. **Supplier responses are backend-written**: The public supplier form POSTs to the API server (Express), which uses Firebase Admin SDK to write to `supplier_responses`. Direct client writes are denied (`allow write: if false`). This avoids Firebase auth for suppliers entirely.
2. **Stage-gated updates**: Rather than encoding all stage logic in rules (which would be verbose and brittle), prefer a pattern where each update is validated by: (a) the actor's role, (b) the current `status` value on the existing document, and (c) the `affectedKeys` diff.
3. **Approval chain**: Each approver can only update their own `approvals` document when the request `status == "pending_approvals"` and the current chain order is their step.
4. **Super Admin override**: `isSuperAdmin()` bypasses all stage checks — can read/write everything, reroute, or terminate.
5. **workflow_events**: `allow create: if isAdmin() || isOwner(requestId)` (scoped). `allow update, delete: if isSuperAdmin()` (emergency only). This preserves the audit trail.

---

## 7. Implementation Phases

### Phase A — Data Model & Backend Foundation
- Define `procurement_requests` schema (TypeScript interfaces + Zod)
- Create API routes in `artifacts/api-server` for:
  - Public supplier form submission (no auth)
  - Supplier link generation
  - File upload proxy (Cloudinary/Firebase Storage)
- Write `workflow_events` append helper (shared utility)
- Firebase Admin SDK setup in api-server for server-side writes

### Phase B — Supplier Form (Public Web Page)
- New web artifact (or simple HTML page served by api-server) for the supplier form
- All fields from §5 Stage 3, with auto-calculated VAT
- File upload for required attachments
- Submits to API route → writes `supplier_responses` via Admin SDK
- Confirmation page after submission

### Phase C — Procurement Dashboard
- New screen: active `procurement_requests` list
- Request detail: supplier links + responses panel
- Generate link UI (label, optional expiry)
- Forward quotations to Director action
- Add PO number + attachment after Director approval
- Close request action

### Phase D — Director / Requester Flow
- Request creation form (adapted from current new-request screen)
- Quotation review screen (forwarded responses only)
- Approve / reject quotation with PR number + budget fields

### Phase E — Approval Chain
- Sequential approvals screen per role
- Each approver sees only their pending step
- Approve / note UI

### Phase F — Finance Payment
- Payment recording screen
- Attach invoice + reference

### Phase G — Super Admin Controls
- Full dashboard (all requests, all stages)
- Reroute workflow (change status, change owner)
- Terminate request with reason
- `showFullWorkflow` toggle per request

### Phase H — Migration & Cleanup
- Run migration script for existing `requests` → `procurement_requests`
- Deprecate old `requests` collection (read-only mode)
- Update Firestore rules to lock old collection

---

## 8. Risks and Migration Notes

### Risk 1 — Existing `requests` collection
All current data lives in `requests`. The new workflow uses `procurement_requests`. A migration script (Phase H) will copy records and map old statuses to the closest new status. Old records will remain readable in read-only mode during a transition period. The current app screens should continue showing old `requests` records until Phase H completes.

### Risk 2 — canSubmitRequests semantics shift
Currently `canSubmitRequests` gates request creation in the old flow. In the new flow it also gates Stage 5 (Director quotation approval). The flag remains the right mechanism but its UI label should clarify it means "Director-level access" not just "can submit."

### Risk 3 — Supplier form is a public endpoint
The supplier form link must be unguessable (use a cryptographically random token, not an auto-increment ID). The API route must validate that the link is active and not expired before accepting a submission. Rate-limiting on the API route is recommended.

### Risk 4 — File uploads from unauthenticated suppliers
Suppliers cannot use Firebase Storage client SDK (no auth). Files must be uploaded through the api-server acting as an authenticated intermediary (Firebase Admin SDK or Cloudinary upload preset with a server-signed token). The current `EXPO_PUBLIC_CLOUDINARY_*` credentials are client-side; a server-side Cloudinary upload must use an unsigned upload preset or a server-signed token — verify preset configuration before Phase B.

### Risk 5 — Sequential approval chain complexity in rules
Writing Firestore rules that enforce "only the current step's approver can act" requires reading the approval chain from the request document (a `get()` call). This is possible but costly (one extra read per write operation). Consider enforcing order in the API server instead and using simpler rules (role-based, not order-based).

### Risk 6 — ~~Role model gap — "Operations" role~~ RESOLVED (v1.1)
`"operations"` is now a first-class role in the final role list. It must be added to:
- `UserRole` type in `context/AuthContext.tsx`
- `validRole()` in `firestore.rules`
- `isAssistantAdmin()` in `firestore.rules` (so operations users can access requests as admins)
- Role picker UI in `app/(tabs)/admin.tsx`
- `roleLabel` / `roleColor` in `UserProfileModal.tsx` and `admin.tsx`
- EN + AR translations in `i18n/translations.ts`

This must be done before Phase E (Approval Chain) and is a prerequisite blocker for that phase. It is safe to add at any time as a pure additive change with no migration risk.

### Migration Sequence
1. Deploy Phase A (backend foundation) — no UI changes
2. Deploy Phase B (supplier form) — additive, does not touch existing screens
3. Deploy Phases C–F incrementally behind a feature flag (Super Admin can toggle)
4. After all phases are stable, run Phase H migration
5. Deprecate old `requests` collection

---

## Phase A — Implemented ✓

**Status**: Complete  
**Date**: 2026-05-11

### Files created

| File | Purpose |
|---|---|
| `lib/procurement/package.json` | `@workspace/procurement` ESM lib, zod dependency |
| `lib/procurement/tsconfig.json` | Composite TypeScript config (emitDeclarationOnly) |
| `lib/procurement/src/constants.ts` | All enums and constant arrays |
| `lib/procurement/src/types.ts` | `FirestoreTimestamp`, `AttachmentRef` (shared primitives + Zod schemas) |
| `lib/procurement/src/models/procurementRequest.ts` | `ProcurementRequest` Zod schema + inferred type |
| `lib/procurement/src/models/supplierLink.ts` | `SupplierLink` Zod schema + inferred type |
| `lib/procurement/src/models/supplierResponse.ts` | `SupplierResponse` + `SupplierFormInput` Zod schemas + inferred types |
| `lib/procurement/src/models/workflowEvent.ts` | `WorkflowEvent` Zod schema + inferred type |
| `lib/procurement/src/models/approval.ts` | `Approval` Zod schema + inferred type |
| `lib/procurement/src/models/paymentRecord.ts` | `PaymentRecord` Zod schema + inferred type |
| `lib/procurement/src/helpers.ts` | `calculateVat`, `calculatePriceIncludingVat`, `generateRequestNumber`, `isProcurementRole`, `canRoleApproveStep` / `canRoleApproveStage` |
| `lib/procurement/src/index.ts` | Barrel re-export of everything above |

### Files updated

| File | Change |
|---|---|
| `tsconfig.json` (root) | Added `lib/procurement` to solution references |

### Zod usage
Zod **was used** — it was already installed in the workspace catalog (`"zod": "catalog:"`). All model types are derived via `z.infer<>` from their Zod schemas rather than maintained as separate interfaces.

### What Phase A does NOT include
- No Firestore reads or writes
- No API routes
- No Firebase Admin SDK
- No mobile UI changes
- No changes to existing `requests` collection or screens

### Pre-Phase B prerequisites
1. Add `"operations"` role to the mobile app (`AuthContext.tsx`, Firestore rules, admin UI, translations) — see Risk 6 above ✅ done
2. Confirm Cloudinary server-side upload preset configuration (Risk 4)
3. Install Firebase Admin SDK in `artifacts/api-server` and configure service account credentials as environment secrets ✅ done (Phase B)

---

## Phase B — API Server Foundation (IMPLEMENTED)

**Status**: Complete — foundation routes, Firebase Admin init, and helpers in place.  
**Date**: 2026-05-11

### Summary

Phase B prepares the `artifacts/api-server` Express backend for secure supplier link creation and public supplier form submission.  Suppliers have no Firebase account; all Firestore writes must go through the Admin SDK on the backend. Phase B wires up the full routing and validation structure; actual Firestore writes and auth enforcement are Phase C TODOs clearly marked in code.

### New environment variables required

| Variable | Required | Description |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Yes | Firebase project identifier |
| `FIREBASE_CLIENT_EMAIL` | Yes | Service account client email |
| `FIREBASE_PRIVATE_KEY` | Yes | Service account private key (escaped `\n` handled automatically) |

Set all three as Replit environment secrets before Phase C writes are enabled. The server will throw a clear error on first DB use if any are missing.

### New endpoints

| Method | Path | Auth | Status |
|---|---|---|---|
| `POST` | `/api/procurement/supplier-links` | TODO — Phase C (requires `procurement`/`super_admin` role) | Foundation only — no Firestore write |
| `POST` | `/api/public/supplier-response/:token` | None (public) | Foundation only — no Firestore write |

#### `POST /api/procurement/supplier-links`

Validates body with inline Zod schema, generates a cryptographically random 64-character hex token, and returns a structured placeholder response.

**Request body:**
```json
{
  "requestId": "string (required)",
  "supplierNameHint": "string | null (optional)",
  "expiresAt": "{ seconds: number, nanoseconds: number } | null (optional)"
}
```

**Phase B response (202):**
```json
{
  "ok": true,
  "data": {
    "_phase": "B_FOUNDATION",
    "_todo": "Auth enforcement and Firestore write will be added in Phase C.",
    "token": "<64-char hex>",
    "requestId": "...",
    "supplierNameHint": null,
    "expiresAt": null,
    "publicFormUrl": "/supplier/<token>"
  }
}
```

#### `POST /api/public/supplier-response/:token`

Validates body against a Phase-B variant of `SupplierFormInput` (attachment fields optional in Phase B), computes VAT and total price using helpers from `@workspace/procurement`, and returns computed totals.

**Key fields in body:**
```json
{
  "supplierName": "string",
  "supplierEmail": "string",
  "priceExcludingVatSar": 10000,
  "paymentTerms": "net30 | net60 | net90 | advance | on_delivery",
  "deliveryDays": 14,
  "notes": "string (optional)"
}
```

**Phase B response (202):**
```json
{
  "ok": true,
  "data": {
    "_phase": "B_FOUNDATION",
    "_todo": "Token validation and Firestore write will be added in Phase C.",
    "computedTotals": {
      "priceExcludingVatSar": 10000,
      "vatAmountSar": 1500,
      "priceIncludingVatSar": 11500,
      "vatRatePercent": 15
    },
    "receivedFields": ["supplierName", "supplierEmail", "priceExcludingVatSar", ...]
  }
}
```

### New files created

| File | Purpose |
|---|---|
| `artifacts/api-server/src/lib/firebase-admin.ts` | Firebase Admin SDK singleton init; `getAdminDb()`, `normalizePrivateKey()` |
| `artifacts/api-server/src/lib/response.ts` | `safeJsonResponse<T>()`, `errorJsonResponse()` helpers |
| `artifacts/api-server/src/routes/procurement.ts` | `POST /api/procurement/supplier-links` — internal route |
| `artifacts/api-server/src/routes/publicSupplier.ts` | `POST /api/public/supplier-response/:token` — public route |

### Files updated

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/index.ts` | Registered `/procurement` and `/public` routers |
| `artifacts/api-server/tsconfig.json` | Added `lib/procurement` to references |
| `artifacts/api-server/package.json` | Added `@workspace/procurement`, `firebase-admin ^12`, `zod catalog:` |

### firebase-admin installation status
`firebase-admin` was **not installed** before Phase B. It was added as a `^12` dependency in `artifacts/api-server/package.json`.  The esbuild config in `build.mjs` already listed `firebase-admin` in its `external` array — it was anticipated from the start and required no build config changes.

### What Phase B does NOT include

- No Firestore reads or writes (all pending Phase C)
- No auth middleware (Firebase ID token verification pending Phase C)
- No token lookup / expiry validation (pending Phase C)
- No supplier file upload endpoint (pending Phase C)
- No mobile UI changes
- No changes to Firestore security rules

### Phase C prerequisites

1. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` as environment secrets ← still required before endpoints are live
2. Implement Firebase ID token verification middleware for internal routes ✅ done (Phase C)
3. Add Firestore write logic to `supplier-links` route using `getAdminDb()` ✅ done (Phase C)
4. Add Firestore write logic to `supplier-response` route (write `supplier_responses`, update `supplier_links`, append `workflow_events`) ✅ done (Phase C)
5. Replace Phase B partial schema in `publicSupplier.ts` with full `supplierFormInputSchema` once file upload flow is in place
6. Build the supplier public form UI (web or in-app webview)

---

## Phase C — Secure Firestore Writes (IMPLEMENTED)

**Status**: Complete — both endpoints now write to Firestore using Firebase Admin SDK.  
**Date**: 2026-05-11

### Summary

Phase C activates the real Firestore writes behind both API endpoints. The internal supplier-link creation route is now protected by Firebase ID token verification. The public supplier submission route performs full token validation, expiry checks, and atomic batch writes. All error responses use machine-readable `code` fields. No mobile screens were changed.

### Auth middleware — `requireInternalAuth`

File: `artifacts/api-server/src/lib/auth.ts`

Applied to all internal (non-public) API routes. For each request it:

1. Reads `Authorization: Bearer <Firebase ID token>` header — returns `401 unauthorized` if missing
2. Verifies the ID token with `getAdminAuth().verifyIdToken()` — returns `401 unauthorized` if invalid or expired
3. Loads `users/{uid}` from Firestore — returns `401 unauthorized` if profile missing
4. Rejects accounts with `deletionRequested: true` — returns `403 forbidden`
5. Attaches `req.internalUser` (`uid`, `email`, `displayName`, `role`, `canSubmitRequests`)

### `POST /api/procurement/supplier-links` — now live

**Auth**: Firebase ID token required. Role must be `super_admin` or `procurement`. Returns `403 forbidden` for all other roles.

**Validations (in order):**
1. Role check — `super_admin` or `procurement` only
2. Body schema — `requestId` (required), `supplierNameHint` (optional), `expiresAt` (optional Firestore timestamp)
3. `requestId` must exist in `procurement_requests` collection — `404 request_not_found`
4. Request stage must not be in `TERMINAL_STAGES` (`closed`, `terminated`) — `409 request_terminated`
5. `expiresAt` defaults to 7 days from now if not provided

**Writes (atomic batch):**
- `supplier_links/{id}` — full link document (`id`, `requestId`, `token`, `supplierNameHint`, `createdByUid`, `createdAt`, `expiresAt`, `isActive: true`, `submittedAt: null`, `responseId: null`)
- `workflow_events/{id}` — type `supplier_link_generated` with actor snapshot and `metadata.supplierLinkId`

**Response (201):**
```json
{
  "ok": true,
  "data": {
    "id": "<firestore-doc-id>",
    "token": "<64-char hex>",
    "requestId": "...",
    "supplierNameHint": null,
    "publicFormUrl": "/supplier/<token>",
    "expiresAt": { "seconds": 1234567890, "nanoseconds": 0 }
  }
}
```

### `POST /api/public/supplier-response/:token` — now live

**Auth**: None — public endpoint for suppliers without Firebase accounts.

**Validations (in order):**
1. Token format — must be ≥ 32 characters
2. Token lookup — `supplier_links` queried by `token` field — `404 link_not_found`
3. `isActive` must be `true` — `410 link_expired`
4. `expiresAt` must not be in the past — `410 link_expired`
5. `responseId` and `submittedAt` must both be null — `409 link_already_used`
6. `requestId` must exist in `procurement_requests` — `404 request_not_found`
7. Request stage must not be terminal — `410 link_expired`
8. Body validated against Phase C schema (full `SupplierFormInput` minus attachment fields, which remain optional until Phase D upload flow)
9. VAT computed server-side: `vatAmountSar` and `priceIncludingVatSar` — never trusted from client

**Writes (atomic Firestore batch):**
- `supplier_responses/{id}` — full supplier form data + server-computed VAT + `reviewStatus: "pending"`
- `supplier_links/{id}` — update: `submittedAt`, `responseId`, `isActive: false`
- `workflow_events/{id}` — type `supplier_response_received` with `actorName: companyName`, `actorRole: "supplier"`

**Response (201):**
```json
{
  "ok": true,
  "data": {
    "responseId": "<firestore-doc-id>",
    "status": "submitted",
    "computedTotals": {
      "priceExcludingVatSar": 10000,
      "vatAmountSar": 1500,
      "priceIncludingVatSar": 11500,
      "vatRatePercent": 15
    }
  }
}
```

### Error codes reference

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing/invalid auth token or user profile not found |
| `forbidden` | 403 | Authenticated but insufficient role or account restricted |
| `request_not_found` | 404 | `requestId` does not exist in `procurement_requests` |
| `link_not_found` | 404 | Token not found in `supplier_links` |
| `link_expired` | 410 | Link deactivated, past `expiresAt`, or request is terminal |
| `link_already_used` | 409 | `responseId` or `submittedAt` already set on the link |
| `request_terminated` | 409 | Request is in `closed` or `terminated` stage |
| `invalid_payload` | 400 | Zod validation failure on request body |
| `server_error` | 500 | Unexpected Firestore or SDK error (no stack trace leaked) |

### New files (Phase C)

| File | Purpose |
|---|---|
| `artifacts/api-server/src/types/express.d.ts` | `InternalUser` interface + Express `Request.internalUser` augmentation |
| `artifacts/api-server/src/lib/auth.ts` | `requireInternalAuth` middleware |

### Files updated (Phase C)

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/firebase-admin.ts` | Added `getAdminAuth()` singleton (Auth instance) |
| `artifacts/api-server/src/lib/response.ts` | `errorJsonResponse()` now accepts optional `code?: string` |
| `artifacts/api-server/src/routes/procurement.ts` | Full Firestore write — replaced Phase B placeholder |
| `artifacts/api-server/src/routes/publicSupplier.ts` | Full Firestore write with batch — replaced Phase B placeholder |

### Firestore collections written by Phase C

| Collection | Written by | Operation |
|---|---|---|
| `supplier_links` | `POST /api/procurement/supplier-links` | `batch.set` (new doc) |
| `workflow_events` | `POST /api/procurement/supplier-links` | `batch.set` (new event) |
| `supplier_responses` | `POST /api/public/supplier-response/:token` | `batch.set` (new doc) |
| `supplier_links` | `POST /api/public/supplier-response/:token` | `batch.update` (submittedAt, responseId, isActive) |
| `workflow_events` | `POST /api/public/supplier-response/:token` | `batch.set` (new event) |

### What Phase C does NOT include

- No Firestore security rules for new collections (still `allow write: if false` for client SDK — correct, writes go through Admin SDK only)
- No file upload endpoint (attachments optional until Phase D)
- No mobile UI to create supplier links or view responses
- No supplier public form UI
- No email notification when a supplier submits

### Phase D prerequisites

1. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` as Replit environment secrets — **endpoints will throw on first call without these**
2. Deploy Firestore rules for `supplier_links`, `supplier_responses`, `workflow_events` (read access for admin roles)
3. Implement `POST /api/public/upload/:token` — Firebase Storage proxy for supplier file uploads before form submission
4. Make attachment fields required in `publicSupplier.ts` once upload flow exists
5. Build supplier public form UI (separate web artifact or in-app webview)
6. Build mobile procurement UI: generate link → share → view responses per request

---

## Phase C.1 — Runtime Verification (IMPLEMENTED)

**Status**: Complete — all routes verified at runtime.  
**Date**: 2026-05-11

### Summary

Phase C.1 adds diagnostic endpoints that confirm the API server is wired correctly without touching any mobile screens or adding new features. All endpoints were verified live against the running server.

### New endpoints

#### `GET /api/health` — always available

Reports whether Firebase Admin env vars are present (never their values). Safe to expose publicly.

```
curl http://localhost:80/api/health
```

**Response:**
```json
{
  "ok": true,
  "api": "AF Procurement Hub API",
  "firebaseAdmin": {
    "FIREBASE_PROJECT_ID": "present | missing",
    "FIREBASE_CLIENT_EMAIL": "present | missing",
    "FIREBASE_PRIVATE_KEY": "present | missing",
    "allConfigured": true | false
  },
  "timestamp": "2026-05-11T08:58:44.789Z"
}
```

#### `GET /api/admin-check` — dev only (`NODE_ENV !== "production"`)

Calls `getAdminDb()` and `getAdminAuth()` to confirm the Firebase Admin SDK initialises. Returns `503` with a clean error message (no stack traces, no secret values) if credentials are missing.

```
curl http://localhost:80/api/admin-check
```

**Success (200):** `{ "ok": true, "firestoreInitialized": true, "authInitialized": true }`  
**Failure (503):** `{ "ok": false, "error": "Firebase Admin SDK is not configured. Set FIREBASE_PROJECT_ID…" }`

#### `GET /api/debug/me` — dev only, requires Firebase ID token

Verifies the `requireInternalAuth` middleware reads the correct fields from the Firestore `users/{uid}` profile.

```
curl http://localhost:80/api/debug/me \
  -H "Authorization: Bearer <Firebase ID token>"
```

**Response:**
```json
{
  "ok": true,
  "uid": "...",
  "email": "...",
  "displayName": "...",
  "role": "procurement",
  "canSubmitRequests": false,
  "note": "dev-only endpoint — not available in production"
}
```

### Route registration confirmed (live curl tests)

| Endpoint | Expected behaviour without credentials | Observed |
|---|---|---|
| `GET /api/healthz` | `{ status: "ok" }` | ✅ |
| `GET /api/health` | env var presence flags | ✅ |
| `GET /api/admin-check` | `503` with clean SDK error | ✅ |
| `POST /api/procurement/supplier-links` | `401 unauthorized` (no Bearer token) | ✅ |
| `POST /api/public/supplier-response/:token` | `500 server_error` (SDK not configured) | ✅ |

### How to set the Replit secrets

Open **Replit → Secrets** (or use the environment-secrets skill) and add:

| Secret name | Where to find the value |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase Console → Project Settings → General → Project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase Console → Project Settings → Service Accounts → Generate new private key → JSON field `client_email` |
| `FIREBASE_PRIVATE_KEY` | Same JSON → field `private_key` (copy the full value including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`) |

After setting the secrets, restart the API Server workflow. `GET /api/health` will show `allConfigured: true` and `GET /api/admin-check` will return `{ ok: true }`.

### Files changed (Phase C.1)

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/health.ts` | Added `GET /api/health` endpoint with env var presence flags |
| `artifacts/api-server/src/routes/devTools.ts` | New — `GET /api/admin-check` + `GET /api/debug/me` (dev-only) |
| `artifacts/api-server/src/routes/index.ts` | Registered `devToolsRouter` |

### Confirmation — no secrets logged

- `GET /api/health` returns `"present"` or `"missing"` strings — never the actual values
- `GET /api/admin-check` error message comes from our own `throw new Error(...)` in `firebase-admin.ts` — contains only the guidance text we wrote, not any SDK internals or credential data
- `GET /api/debug/me` returns only the 5 fields from `req.internalUser` — no raw Firestore document, no token, no private key
- Pino logger redacts `req.headers.authorization` via the `redact` config in `lib/logger.ts`

### Phase D prerequisites (unchanged)

Set the three Replit secrets listed above — everything else is already wired.
