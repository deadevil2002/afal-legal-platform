# Current App Capability Audit — AF Procurement Hub
**Date:** 2026-05-12  
**Spec reference:** AF_PROCUREMENT_WORKFLOW_SPEC.md v1.2  
**Purpose:** Map every existing file/capability to one of three outcomes: REUSE AS-IS, REUSE WITH CHANGES, or REPLACE/BUILD NEW. This drives the build plan for the full 12-stage RFQ-first procurement workflow.

---

## 1. Navigation & App Shell

### `app/_layout.tsx` — **REUSE WITH MINOR CHANGES**
- Providers: SafeAreaProvider → ErrorBoundary → QueryClientProvider → AuthProvider → RequestsProvider → GestureHandlerRootView → KeyboardProvider → Stack
- `AuthGate`: checks `user && profile && inAuth` — correct race-condition guard in place
- Registered routes: `(tabs)`, `auth/login`, `auth/register`, `auth/forgot-password`, `request/new`, `request/[id]`, `transfer-super-admin`, `legal/[page]`
- **Changes needed:** Add new procurement detail route if kept separate from legacy `request/[id]`; add supplier quotation review route; add approval routes.

### `app/(tabs)/_layout.tsx` — **REUSE WITH MINOR CHANGES**
- 4 tabs: Home (`index`), Requests, Admin (hidden if not admin), Settings
- Icon set: home, document-text, shield-check, cog (fill/outline variants)
- **Changes needed:** Potentially a 5th tab or rename "Requests" → "Procurement" once old `requests` collection is retired.

---

## 2. Auth Screens

### `app/auth/login.tsx` — **REUSE AS-IS**
### `app/auth/register.tsx` — **REUSE AS-IS**
- Collects: name, email, phone, employeeNumber, department, password
- Defaults new users to `role="procurement"` (correct for new hires)
### `app/auth/forgot-password.tsx` — **REUSE AS-IS**

---

## 3. Main Tab Screens

### `app/(tabs)/index.tsx` (Home) — **REUSE WITH CHANGES**
- Stat cards: total, submitted, active, closed
- **Problem:** `TERMINAL_STATUSES` hardcoded as `["Approved / PO Issued", "Rejected", "Resolved / Closed", "Escalated"]` — old values
- **Problem:** Reads from `RequestsContext` which uses old `requests` collection
- **Changes needed:**  
  - Wire to new `ProcurementRequestsContext` (reads `procurement_requests`)
  - Replace terminal-status logic to use `TERMINAL_STAGES` from `@workspace/procurement`
  - Update stat labels to match new stage model (e.g. "active" = not in terminal stage)
  - Keep canSubmit check (`profile?.canSubmitRequests === true`) — already correct

### `app/(tabs)/requests.tsx` — **REPLACE / SIGNIFICANT REWRITE**
- Reads from `RequestsContext` (old `requests` collection)
- Filter chips hardcoded to 8 old statuses
- Search by title/description/category/type — logic is reusable
- **Changes needed:**  
  - New `ProcurementRequestsContext`
  - Filter chips replaced with 12-stage filters
  - Card rendered via `RequestCard` which also needs extension
  - File can be kept but ~70% of it changes — treat as rewrite

### `app/(tabs)/admin.tsx` — **REUSE WITH CHANGES**
- Two tabs: Requests (admin view of all requests) + Users (Super Admin only)
- Role assignment UI: all 7 new roles already present + canSubmitRequests toggle ✓
- **Problem:** Requests tab reads from `requests` collection (old)
- **Changes needed:**  
  - Requests tab → read from `procurement_requests`
  - Status options in change-status dropdown → new 12 stages
  - Could add a 3rd tab: "Supplier Responses" for reviewing quotations

### `app/(tabs)/settings.tsx` — **REUSE AS-IS** (1566 lines)
- Module-level sub-components (keyboard stability fix already applied) ✓
- Edit displayName, department; phone + employeeNumber via profile change requests
- Language toggle EN/AR ✓
- Account deletion request flow ✓
- No procurement-specific data touches this screen

---

## 4. Request Screens

### `app/request/new.tsx` — **REPLACE**
- Writes to `requests` collection with old schema (title, description, category, priority, attachments)
- No fields for: budget estimate, department, urgency, target delivery date, RFQ trigger
- **Action:** Build new `app/procurement/new.tsx` screen that writes to `procurement_requests` with the spec v1.2 schema. Keep old `request/new.tsx` intact for legacy record viewing — just gate it by `canSubmitRequests` as before.

### `app/request/[id].tsx` — **REPLACE / BUILD PARALLEL** (1016 lines)
Key capabilities (all need porting):
- Real-time `onSnapshot` on request doc ✓
- Real-time `onSnapshot` on `request_messages` (top-level, by requestId) ✓
- Message sending with up to 3 attachments ✓
- `viewedBy` tracking (green pulsing new-dot) ✓
- Admin status change modal (bottom sheet) — needs replacement with stage-change
- Super Admin delete (two-step confirmation batch) ✓ — keep
- `reopenRequest()` — resets to "Under Review" — keep concept, new stage name
- `isLocked` check — replaces with `TERMINAL_STAGES` check
- renderMessage: admin bubble color check uses `assistant_admin, super_admin, admin` — **update** to new role names

**Problem:** Reads from `requests/{id}` (old collection). Entire component must be forked/rebuilt for `procurement_requests/{id}`.

**Action:** Build `app/procurement/[id].tsx` with:
- 12-stage timeline view (new)
- Existing message thread (port from here)
- Quotation review section (new, reads supplier_responses)
- Approval action panel (new, per-stage approve/reject)
- Budget/PO attachment section (new)
- Keep old `request/[id].tsx` for legacy records

---

## 5. Admin Sub-Screens

### `app/admin/export-data.tsx` — **REUSE WITH ADDITIONS**
- 4 sheets: Requests, Users, Deletion Requests, Audit Logs
- ExcelJS dynamic import — MUST remain dynamic (`const ExcelJS = (await import("exceljs")).default`) ✓
- bufferToBase64 custom pure-JS (Hermes safe) ✓
- expo-file-system SDK 54+ path (cacheDirectory) ✓
- **Changes needed:** Add sheets: Procurement Requests, Workflow Events, Supplier Quotations, Approvals, Purchase Orders. Old "Requests" sheet retained for legacy records.

### `app/admin/profile-changes.tsx` — **REUSE AS-IS**
- Super Admin approves phone/employeeNumber change requests
- Reads `profile_change_requests` collection (onSnapshot)
- No procurement data involvement

### `app/admin/send-to-employee.tsx` — **REUSE WITH CHANGES**
- Admin creates request directed at specific employee (search by name/number/dept)
- getAllUsers() from AuthContext ✓
- Currently writes to `requests` collection (old)
- **Changes needed:** Write to `procurement_requests` instead; add new fields (stage = submitted, createdByAdmin=true, targetEmployeeId)

### `app/admin/deletion-requests.tsx` — **REUSE AS-IS**
- Account deletion request management
- No procurement involvement

---

## 6. Components

### `components/RequestCard.tsx` — **REUSE WITH EXTENSION**
- `Request` interface: id, title, description, type, category, status, priority, userId, createdBy, createdByName, createdByAdmin, targetEmployeeName, attachments[], viewedBy, messageCount
- Animated pulsing new-dot for unread ✓
- Tappable sender name (admin view) ✓
- Category tag display with legacy fallback map ✓
- **Changes needed:**  
  - Extend `Request` interface or create new `ProcurementRequest` interface
  - Replace `status` display with `stage` display
  - Add stage-specific icon/color in StatusBadge call
  - Add RFQ ref tag if present

### `components/StatusBadge.tsx` — **REPLACE**
- Hardcoded 8 procurement statuses + 6 legacy statuses + 4 snake_case fallbacks
- Will not cover 12 new stages (rfq_submitted, budget_approval, quotation_under_review, etc.)
- **Action:** New `StageBadge` component (or extend StatusBadge) with 14 PROCUREMENT_STAGES values from `@workspace/procurement/constants.ts` + legacy fallback entries retained

### `components/AttachmentPicker.tsx` — **REUSE AS-IS** ✓
- Bottom-sheet modal (slides up) ✓
- iOS ViewController guard (onDismiss pattern) ✓
- 25s timeout safety ✓
- Cloudinary unsigned upload (direct device→CDN) ✓
- Folder routing via `uploadContext`: `{ type: "request" | "message", requestId? }` — extend to add `"procurement"`, `"quotation"`, `"po"` types
- Max 5 files, JPEG/PNG/GIF/WebP/PDF/DOC/DOCX ✓
- `pickingRef` concurrent-call guard ✓

### `components/AttachmentViewer.tsx` — **REUSE AS-IS** ✓
- Image: fullscreen modal with zoom (ScrollView maximumZoomScale=4) ✓
- PDF/Word: Open (Linking → Sharing → WebBrowser) + Download (fl_attachment URL) ✓
- Platform-aware (web: anchor click; native: Linking/Sharing/WebBrowser) ✓
- Error state with fallback ✓

### `components/Icon.tsx` — **REUSE AS-IS** (pre-existing TS error — do not modify)
### `components/Logo.tsx` — **REUSE AS-IS**
### `components/UserProfileModal.tsx` — **REUSE AS-IS**
- Fetches `users/{uid}` doc, displays role label + color for all 7 new roles ✓
### `components/AlertModal.tsx` — **REUSE AS-IS** (pre-existing TS error — do not modify)
### `components/ErrorBoundary.tsx` / `ErrorFallback.tsx` — **REUSE AS-IS**
### `components/KeyboardAwareScrollViewCompat.tsx` — **REUSE AS-IS**

---

## 7. Contexts

### `context/AuthContext.tsx` — **REUSE WITH MINOR ADDITIONS**
Current state:
- `UserRole` type: `super_admin | ceo | evp | operations | planning | finance | procurement` ✓ (all 7 new roles)
- `canSubmitRequests` flag: controls RFQ creation ✓
- `isAdmin`: true for ceo, evp, operations, planning, finance, procurement, assistant_admin, super_admin ✓
- `isSuperAdmin`: true for super_admin ✓
- `register()`: defaults new users to `role="procurement"` ✓
- `updateUserProfile()` whitelist: displayName, department, language, updatedAt (security: role not writable) ✓
- `requestProfileChange()`: phone + employeeNumber change requests ✓
- `approveProfileChange()` / `rejectProfileChange()`: Super Admin functions ✓
- `getAllUsers()`: fetches all user profiles (used by send-to-employee) ✓
- `INITIAL_SUPER_ADMIN_EMAIL`: `"Naimi.salem@gmail.com"` (bootstrap only) ✓
- Super Admin transfer: `settings/app.superAdminEmail` + audit_logs ✓

**Changes needed:**  
- Add helper: `canApproveStage(stage: string): boolean` — checks if current user's role can approve the given budget or PO step (using `canRoleApproveBudgetStep` / `canRoleApprovePOStep` from `@workspace/procurement`)
- Add `showFullWorkflow?: boolean` to `UserProfile` interface (already noted in replit.md as missing)
- Push notification token registration already called at auth time (check pushNotifications.ts integration)

### `context/RequestsContext.tsx` — **KEEP FOR LEGACY + BUILD NEW**
Current: reads `requests` collection via two parallel `onSnapshot` queries (userId + createdBy)
- Admin path: `orderBy("createdAt", "desc")` on all requests ✓
- User path: parallel q1 (`userId`) + q2 (`createdBy`), merged in Map ✓
- Race-condition safe: waits for both q1Done + q2Done before flush ✓

**Action:** Build new `context/ProcurementRequestsContext.tsx` that:
- Reads from `procurement_requests` collection
- Uses same parallel-query + Map-merge pattern for user path
- Exposes same interface (`requests, loading, error, refresh`) so screens are drop-in
- Keep old `RequestsContext` for legacy `requests` records (admin export, historical view)

---

## 8. Hooks

### `hooks/useT.ts` — **REUSE AS-IS** ✓
### `hooks/useColors.ts` — **REUSE AS-IS** ✓
- Brand colors: primary `#2D6491`, secondary `#16A8BA`, accent `#BC9B5D` ✓

---

## 9. i18n (`i18n/translations.ts`) — **EXTEND**

Currently present (~400 keys EN + AR):
- All 7 new role names: ceo, evp, operations, planning, finance, procurement, super_admin ✓
- 8 old status strings (Submitted → Approved/PO Issued, Rejected) ✓
- 6 procurement request type strings (Purchase Request, etc.) ✓
- Priority labels: low, medium, high, urgent ✓
- Common UI: error, cancel, save, back, search, etc. ✓

**Missing — must add:**
- 12-stage status display strings (rfqSubmitted, budgetApproval, rfqSentToSuppliers, quotationUnderReview, quotationRejected, poCreated, poApproval, poIssued, goodsReceived, invoiceSubmitted, paymentProcessed, closed — or whatever canonical keys spec v1.2 defines)
- Procurement creation form labels: estimatedBudget, deliveryDate, rfqDetails, urgencyReason, targetDepartment, etc.
- Supplier quotation UI: companyName, priceExclVAT, vatAmount, totalIncVAT, paymentTerms, commercialReg, accreditationNo, ibanText, etc.
- Approval action labels: approveBudget, rejectBudget, approvePO, rejectPO, approvalComment, etc.
- Workflow timeline labels: timelineEvent, approvedBy, rejectedBy, stageChangedAt, etc.
- Supplier link UI: generateLink, supplierLinkExpiry, supplierLinkHint, copyLink, etc.

---

## 10. Constants

### `constants/requestTypes.ts` — **REUSE AS-IS** ✓
- 6 procurement categories, CATEGORY_TRANSLATION_KEYS map ✓

### `constants/requestStatuses.ts` — **KEEP + BUILD NEW**
- 8 statuses: Submitted → Rejected
- Used by `request/[id].tsx` status change modal and `requests.tsx` filter chips
- **Action:** Keep for legacy record display; build new `constants/procurementStages.ts` that re-exports `PROCUREMENT_STAGES` from `@workspace/procurement` with display config (color, labelKey) — same pattern as current file

### `constants/colors.ts` — **REUSE AS-IS** ✓

---

## 11. Lib Files

### `lib/firebase.ts` — **REUSE AS-IS** (pre-existing TS error on getReactNativePersistence — do not modify)
- `initializeAuth` with AsyncStorage persistence (native) ✓
- `initializeFirestore` with `memoryLocalCache()` (web/Replit preview) ✓
- Named exports: `auth`, `db` ✓

### `lib/cloudinary.ts` — **REUSE AS-IS** ✓
- Unsigned upload preset, direct device → CDN ✓
- Folder strategy: `afal/requests/{id}`, `afal/messages/{id}` — extend with `afal/procurement/{id}/rfq`, `afal/procurement/{id}/po`, `afal/quotations/{id}`
- ALLOWED_MIME_TYPES: images + PDF + DOC/DOCX ✓
- No server involvement — fully client-side ✓

### `lib/firebaseErrorMapper.ts` — **REUSE AS-IS** ✓
- Maps Firebase auth error codes → clean EN/AR messages ✓

### `lib/pushNotifications.ts` — **REUSE WITH ONE FIX**
- `sendPushNotification()` — direct client → Expo push service ✓
- `registerForPushNotifications()` — lazy-loads expo-notifications (SDK 53+ safe) ✓
- `configureNotificationHandler()` — foreground display config ✓
- **BUG:** `getAdminPushTokens()` queries `where("role", "in", ["assistant_admin", "super_admin"])` — these are old role names. New admin roles are `ceo, evp, operations, planning, finance, procurement, super_admin`. Fix to include all new roles that should receive notifications.
- `getUserPushToken(uid)` — REUSE AS-IS ✓

---

## 12. API Server (`artifacts/api-server`)

### `routes/procurement.ts` — **COMPLETE — REUSE AS-IS** ✓
- `POST /api/procurement/supplier-links`
- requireInternalAuth → role check (super_admin | procurement)
- Verifies `procurement_requests/{requestId}` exists and not terminal
- Generates 64-char hex token via crypto.randomBytes
- Atomic batch: `supplier_links/{id}` + `workflow_events/{id}`
- Default expiry: 7 days ✓

### `routes/publicSupplier.ts` — **COMPLETE — REUSE AS-IS** ✓
- `POST /api/public/supplier-response/:token`
- No auth required — token lookup in `supplier_links`
- 5 guard checks: format, isActive, expiry, already-used, request not terminal
- VAT computed server-side: 15% (never trust client)
- Atomic batch: `supplier_responses/{id}` + update `supplier_links/{id}` + `workflow_events/{id}`
- Returns computedTotals to caller ✓

### `routes/health.ts` — **REUSE AS-IS** ✓
### `routes/devTools.ts` — **REUSE AS-IS** (dev-only) ✓
### `lib/firebase-admin.ts` — **REUSE AS-IS** ✓
- `getAdminDb()`, `getAdminAuth()`, `normalizePrivateKey()` ✓
- Reads FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY ✓

**API routes still needed:**
- `POST /api/procurement/approvals` — record budget/PO approval or rejection
- `POST /api/procurement/stage-transition` — validate + execute stage change (role check, write workflow_event)
- `POST /api/public/upload/:token` — Cloudinary signed upload for supplier attachments (Phase D)
- `GET /api/procurement/:id/supplier-responses` — fetch responses for a request (admin)

---

## 13. Firestore Collections — Current vs Needed

| Collection | Status | Notes |
|---|---|---|
| `requests` | LEGACY — keep | All current screens read here. Retain for historical data. |
| `request_messages` | LEGACY — keep | Thread messages for legacy requests. |
| `users` | ACTIVE — keep | User profiles, roles, canSubmitRequests, pushToken. |
| `settings/app` | ACTIVE — keep | superAdminEmail for dynamic Super Admin resolution. |
| `audit_logs` | ACTIVE — keep | Extend with new event types beyond super_admin_transfer. |
| `deletion_requests` | ACTIVE — keep | Account deletion flow unchanged. |
| `profile_change_requests` | ACTIVE — keep | Phone/empNum change approval flow unchanged. |
| `procurement_requests` | NEW — build | Main collection for 12-stage workflow. Not yet written from mobile. |
| `supplier_links` | NEW — Phase C done | api-server writes; mobile UI to read in quotation screens. |
| `supplier_responses` | NEW — Phase C done | api-server writes; mobile reads for quotation review. |
| `workflow_events` | NEW — Phase C done | api-server writes; mobile reads for timeline display. |
| `approvals` | NEW — build | Budget and PO approval step records. |
| `purchase_orders` | NEW — build | PO documents, generated when PO approved. |
| `payments` | NEW — build | Payment confirmation records. |

---

## 14. Data Model Gaps

### `procurement_requests` document (spec v1.2) — fields NOT in old `requests`:
- `stage` (string, 14-value enum from PROCUREMENT_STAGES)
- `rfqRef` / `rfqDetails`
- `estimatedBudgetSar`
- `targetDeliveryDate`
- `createdByRole`
- `budgetApprovalSteps[]` (per ApprovalChainType.BUDGET)
- `poApprovalSteps[]` (per ApprovalChainType.PO)
- `quotationRejectedAt` / `quotationRejectionReason`
- `supplierLinkId` / `selectedResponseId`
- `poRef`
- `paymentRef`
- `workflowEventIds[]`

### `request/new.tsx` writes these old fields to `requests`:
```
title, description, category, type, priority, status="Submitted",
userId, createdBy, createdByName, createdByEmployeeNumber,
concernedParties, attachments[], createdAt, updatedAt,
statusChangedAt, statusChangedBy, closedAt, closedBy,
messageCount, viewedBy
```
None of this writes to `procurement_requests` — complete collection migration needed for new requests.

---

## 15. Old-Role Name Contamination Points

Files that still reference old role strings (`assistant_admin`, `super_admin`, `admin`) that may need updating for new role model:

| File | Line(s) | Old value | Fix |
|---|---|---|---|
| `request/[id].tsx` | renderMessage (~331) | `assistant_admin`, `super_admin`, `admin` | Check for all new admin roles |
| `lib/pushNotifications.ts` | `getAdminPushTokens()` (~89) | `["assistant_admin", "super_admin"]` | Add all 6 operational roles |
| `components/StatusBadge.tsx` | STATUS_CONFIG keys | old status strings | Extend with new stages |

---

## 16. Summary Decision Table

| File / Module | Decision | Work Estimate |
|---|---|---|
| `auth/login`, `register`, `forgot-password` | REUSE AS-IS | 0 |
| `(tabs)/settings.tsx` | REUSE AS-IS | 0 |
| `admin/profile-changes.tsx` | REUSE AS-IS | 0 |
| `admin/deletion-requests.tsx` | REUSE AS-IS | 0 |
| `lib/firebase.ts` | REUSE AS-IS | 0 |
| `lib/cloudinary.ts` | REUSE AS-IS (extend folder types) | XS |
| `lib/firebaseErrorMapper.ts` | REUSE AS-IS | 0 |
| `hooks/useT`, `useColors` | REUSE AS-IS | 0 |
| `components/AttachmentPicker` | REUSE AS-IS | 0 |
| `components/AttachmentViewer` | REUSE AS-IS | 0 |
| `components/Icon`, Logo, AlertModal, ErrorBoundary | REUSE AS-IS | 0 |
| `components/UserProfileModal` | REUSE AS-IS | 0 |
| `context/AuthContext` | REUSE + add `canApproveStage()`, fix UserProfile | XS |
| `context/RequestsContext` | KEEP for legacy + build new `ProcurementRequestsContext` | S |
| `(tabs)/_layout.tsx` | REUSE + optional tab rename | XS |
| `app/_layout.tsx` | REUSE + add new routes | XS |
| `(tabs)/index.tsx` | REUSE + wire new context + fix terminal stages | S |
| `(tabs)/requests.tsx` | SIGNIFICANT REWRITE for new collection + 12 stages | M |
| `(tabs)/admin.tsx` | REUSE + switch collection + new stage options | M |
| `admin/send-to-employee.tsx` | REUSE + switch to procurement_requests | S |
| `admin/export-data.tsx` | REUSE + add procurement sheets | M |
| `components/RequestCard` | REUSE + extend interface + stage display | S |
| `components/StatusBadge` | REPLACE with StageBadge (12 stages + legacy fallback) | S |
| `constants/requestStatuses.ts` | KEEP + build `constants/procurementStages.ts` | XS |
| `i18n/translations.ts` | EXTEND: ~80–120 new keys (EN+AR) | M |
| `lib/pushNotifications.ts` | REUSE + fix `getAdminPushTokens()` role list | XS |
| `request/new.tsx` | REPLACE — build `procurement/new.tsx` | L |
| `request/[id].tsx` | REPLACE — build `procurement/[id].tsx` | XL |
| `api-server/procurement.ts` | COMPLETE — reuse | 0 |
| `api-server/publicSupplier.ts` | COMPLETE — reuse | 0 |
| **NEW: `procurement/new.tsx`** | BUILD | L |
| **NEW: `procurement/[id].tsx`** | BUILD (timeline + messages + quotations + approvals) | XL |
| **NEW: `procurement/quotation-review.tsx`** | BUILD | L |
| **NEW: `context/ProcurementRequestsContext.tsx`** | BUILD | S |
| **NEW: `constants/procurementStages.ts`** | BUILD | XS |
| **NEW: `components/StageBadge.tsx`** | BUILD | S |
| **NEW: `components/WorkflowTimeline.tsx`** | BUILD | M |
| **NEW: `components/ApprovalPanel.tsx`** | BUILD | M |
| **NEW: `api-server/routes/approvals.ts`** | BUILD | M |
| **NEW: `api-server/routes/stageTransition.ts`** | BUILD | M |

---

## 17. Key Architectural Decisions to Lock In

1. **Parallel collections** — `requests` (legacy) and `procurement_requests` (new) coexist. No migration script needed now; historical data stays readable.
2. **New screens use new collection** — `procurement/new.tsx` and `procurement/[id].tsx` are new routes; old `request/new.tsx` and `request/[id].tsx` remain for legacy record viewing by admins.
3. **RequestsContext duality** — Keep old context for legacy screens; new `ProcurementRequestsContext` for new screens. Both live under `AuthProvider`.
4. **Stage transitions via API server** — Stage changes that require role-enforcement (budget approval, PO approval) go through `POST /api/procurement/stage-transition` (to be built). Simple admin status changes (e.g. mark received) may stay client-side with Firestore Security Rules.
5. **Supplier link flow** — Already fully server-backed (Phase C). Mobile side needs UI to (a) trigger link generation, (b) display link/QR to share with supplier, (c) list/review received responses.
6. **Attachment folders** — Extend `UploadContext` type in `AttachmentPicker` to support `{ type: "procurement", requestId }`, `{ type: "quotation", responseId }`, `{ type: "po", requestId }`. No change to upload mechanics.
7. **i18n** — All new keys added to `translations.ts` in the existing structure. No new i18n library. Arabic translations required for every new key simultaneously.
