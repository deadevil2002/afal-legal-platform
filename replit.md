# Arabian Fal Legal Platform

## Overview

Enterprise-grade mobile app for Arabian Fal — a legal services request and tracking platform. Built with Expo (React Native) + Firebase.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Mobile**: Expo (React Native) — `artifacts/mobile`
- **Backend**: Express 5 — `artifacts/api-server`
- **Database**: Firebase Firestore (real-time)
- **Auth**: Firebase Authentication
- **Storage**: Firebase Storage
- **Language**: TypeScript

## Features

- **Authentication**: Email/password login & registration via Firebase Auth; forgot password flow
- **Employee Number**: Every user profile has an `employeeNumber` field (set at registration)
- **Request Management**: Users create, track, and filter 6 legal service request categories
- **Attachments**: Files (images, PDFs, Word docs) can be attached to requests and messages via Firebase Storage
- **Conversation Threads**: Per-request real-time messaging in top-level `request_messages` collection
- **Admin Dashboard**: Admins manage all requests with 8-stage workflow statuses
- **Send to Employee**: Admins can create requests directed at specific employees (search by name/number/dept)
- **Super Admin**: Ownership transfer, promote/demote assistant admins
- **Settings & Profile**: Edit profile, show employeeNumber, language toggle (EN/AR), account deletion requests
- **Bilingual**: English (default) + Arabic via settings toggle

## Brand Colors (Official Arabian Fal)

- Primary: `#2D6491` (Dark Azure Blue)
- Secondary: `#16A8BA` (Teal)
- Accent: `#BC9B5D` (Gold)
- Neutral: `#000000` (Black)
- Additional: `#112B4D`, `#0C233C`, `#006485`, `#005D8B`, `#5D1E5E`

## Security

- Firebase Security Rules enforce role-based access (user vs admin)
- Users only access their own data; admins access all
- No client-side role manipulation — all validation is backend-enforced

## Key Files

- `artifacts/mobile/lib/firebase.ts` — Firebase initialization (auth + Firestore)
- `artifacts/mobile/context/AuthContext.tsx` — Auth + language state, profile change request functions
- `artifacts/mobile/i18n/translations.ts` — EN/AR translations
- `artifacts/mobile/constants/colors.ts` — Brand design tokens
- `artifacts/mobile/app/(tabs)/` — Main screens
- `artifacts/mobile/app/(tabs)/settings.tsx` — Profile settings, phone/empNum change request flow
- `artifacts/mobile/app/request/` — Request detail + new request screens
- `artifacts/mobile/app/auth/` — Login + register screens
- `artifacts/mobile/app/admin/profile-changes.tsx` — Super Admin profile change request approval screen
- `artifacts/mobile/app/admin/export-data.tsx` — Excel export (ExcelJS loaded lazily via dynamic import)

## Critical Implementation Notes

### Firebase Auth (`lib/firebase.ts`)
- Uses `initializeAuth` (not `getAuth`) for explicit persistence control
- Native: `getReactNativePersistence(AsyncStorage)` — auth persists across app restarts
- Web: `browserLocalPersistence` — same as browser default
- Firestore: `memoryLocalCache()` on web (prevents SQLite errors in Replit iframe), default persistent cache on native

### Auth Navigation Guard (`app/_layout.tsx` — AuthGate)
- Checks `user && profile && inAuth` before redirecting to tabs (not just `user`)
- This prevents the race condition where a registration batch failure causes a brief flash to tabs
- Profile being null while user is non-null means: auth exists but Firestore profile is not yet loaded — do NOT redirect

### ExcelJS (`app/admin/export-data.tsx`)
- MUST remain `import type ExcelJS from "exceljs"` — static import causes stack overflow on app startup
- MUST use `const ExcelJS = (await import("exceljs")).default` inside the handler only
- Never change back to a static `import ExcelJS from "exceljs"`

### Profile Change Request Flow
- Phone and employeeNumber changes by normal users go through `requestProfileChange()` in AuthContext
- Super Admin reviews/approves/rejects via `app/admin/profile-changes.tsx`
- Approval uses Firestore batch: updates user doc + updates index docs + marks request approved
- `updateUserProfile` whitelist: `displayName`, `department`, `language`, `updatedAt` ONLY

### Interface Imports
- `ProfileChangeRequest` is a TypeScript interface — always use `import type { ProfileChangeRequest }` to avoid runtime `undefined` values
- Babel strips `import type` completely; without `type`, Metro keeps the import statement but the value is `undefined` at runtime

### StyleSheet
- Never use `marginLeft: "auto" as unknown as number` — React Native StyleSheet does not accept string values for numeric props via cast hacks
- Use `justifyContent: "space-between"` on the parent row instead

## Super Admin Logic

- **Initial bootstrap Super Admin email**: `Naimi.salem@gmail.com` (in `context/AuthContext.tsx` as `INITIAL_SUPER_ADMIN_EMAIL`)
- This is a **bootstrap-only** email — after a Super Admin transfer, the active super admin is tracked in Firestore at `settings/app.superAdminEmail`
- `resolveRole()` checks `settings/app.superAdminEmail` dynamically (subscribes via `onSnapshot`) — not statically hardcoded
- Super Admin can promote users to `assistant_admin` or demote them back to `user`
- **Super Admin Transfer** — stored atomically in Firestore:
  - `settings/app.superAdminEmail` → updated to new owner
  - `audit_logs` collection → immutable audit record with `transferredBy`, `transferredAt`, `previousSuperAdmin`, `newSuperAdmin`
  - Previous super admin role → downgraded to `assistant_admin`
  - New super admin role → elevated to `super_admin`
  - Requires Firebase re-authentication (password confirmation) before executing
- Regular users cannot self-assign elevated roles (`updateUserProfile` strips `role` field)
- All role enforcement is done server-side in Firestore security rules

## Request Types

The approved request types are:
1. Amicable Settlement
2. Complaint
3. Legal Consultation
4. Investigation Request
5. Contract Issue
6. Violation Report

## Firebase Setup

Requires environment secrets:
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

## Firebase Security Rules (Deploy to Firebase Console)

Deploy these rules in Firebase Console → Firestore → Rules.

**Key design decisions:**
- `userId` field on `requests` and `request_messages` (not `createdBy`) — required by these rules
- `request_messages` is a **top-level collection**, not a subcollection of `requests`
- Super Admin is dynamically resolved: bootstrap email `Naimi.salem@gmail.com` OR `role == "super_admin"` in Firestore
- Composite Firestore index required: `requests` collection — `userId` (ASC) + `createdAt` (DESC)
- Composite Firestore index required: `request_messages` collection — `requestId` (ASC) + `createdAt` (ASC)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function authEmail() {
      return signedIn() && request.auth.token.email != null
        ? request.auth.token.email
        : "";
    }

    function bootstrapSuperAdminEmail() {
      return "Naimi.salem@gmail.com";
    }

    function userPath(uid) {
      return /databases/$(database)/documents/users/$(uid);
    }

    function userExists(uid) {
      return exists(userPath(uid));
    }

    function userDoc(uid) {
      return get(userPath(uid));
    }

    function currentUserExists() {
      return signedIn() && userExists(request.auth.uid);
    }

    function currentUserRole() {
      return currentUserExists()
        ? userDoc(request.auth.uid).data.role
        : null;
    }

    function isSuperAdmin() {
      return signedIn() && (
        authEmail() == bootstrapSuperAdminEmail() ||
        currentUserRole() == "super_admin"
      );
    }

    function isAssistantAdmin() {
      return signedIn() && currentUserRole() == "assistant_admin";
    }

    function isAdmin() {
      return isSuperAdmin() || isAssistantAdmin();
    }

    function isOwner(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    function validRole(role) {
      return role in ["user", "assistant_admin", "super_admin"];
    }

    function validRequestCategory(category) {
      return category in [
        "Amicable Settlement",
        "Complaint",
        "Legal Consultation",
        "Investigation Request",
        "Contract Issue",
        "Violation Report"
      ];
    }

    function validRequestStatus(status) {
      return status in [
        "Submitted",
        "Under Review",
        "Employee Contacted",
        "In Progress",
        "Proposed Resolution",
        "Employee Feedback",
        "Resolved / Closed",
        "Escalated"
      ];
    }

    match /users/{uid} {
      allow read: if isOwner(uid) || isAdmin();
      allow create: if isOwner(uid)
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.email == authEmail()
        && validRole(request.resource.data.role)
        && (
          request.resource.data.role == "user" ||
          (
            authEmail() == bootstrapSuperAdminEmail() &&
            request.resource.data.role == "super_admin"
          )
        );
      allow update: if
        (
          isOwner(uid)
          && request.resource.data.uid == resource.data.uid
          && request.resource.data.email == resource.data.email
          && request.resource.data.role == resource.data.role
        )
        || isAdmin();
      allow delete: if isSuperAdmin();
    }

    match /requests/{requestId} {
      allow create: if signedIn()
        && request.resource.data.userId == request.auth.uid
        && validRequestCategory(request.resource.data.category)
        && validRequestStatus(request.resource.data.status);
      allow read: if signedIn() && (
        resource.data.userId == request.auth.uid ||
        isAdmin()
      );
      allow update: if signedIn() && (
        (
          resource.data.userId == request.auth.uid
          && request.resource.data.userId == resource.data.userId
          && request.resource.data.status == resource.data.status
          && request.resource.data.statusChangedBy == resource.data.statusChangedBy
          && request.resource.data.statusChangedAt == resource.data.statusChangedAt
          && request.resource.data.closedBy == resource.data.closedBy
          && request.resource.data.closedAt == resource.data.closedAt
          && request.resource.data.category == resource.data.category
        )
        ||
        (
          isAdmin()
          && validRequestCategory(request.resource.data.category)
          && validRequestStatus(request.resource.data.status)
        )
      );
      allow delete: if isSuperAdmin();
    }

    match /request_messages/{messageId} {
      allow create: if signedIn() &&
        (
          request.resource.data.userId == request.auth.uid ||
          isAdmin()
        );
      allow read: if signedIn() &&
        (
          resource.data.userId == request.auth.uid ||
          isAdmin()
        );
      allow update: if false;
      allow delete: if isSuperAdmin();
    }

    match /deletion_requests/{docId} {
      allow create: if signedIn()
        && request.resource.data.userId == request.auth.uid;
      allow read: if signedIn() && (
        resource.data.userId == request.auth.uid ||
        isAdmin()
      );
      allow update: if isAdmin();
      allow delete: if isSuperAdmin();
    }

    match /settings/{docId} {
      allow read: if signedIn();
      allow write: if isSuperAdmin();
    }

    match /audit_logs/{logId} {
      allow read: if isAdmin();
      allow create: if isAdmin();
      allow update, delete: if false;
    }
  }
}
```
