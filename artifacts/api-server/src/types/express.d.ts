// Express Request augmentation — adds internalUser to all request objects
// populated by the requireInternalAuth middleware in src/lib/auth.ts.

export interface InternalUser {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  canSubmitRequests: boolean;
}

declare global {
  namespace Express {
    interface Request {
      internalUser?: InternalUser;
    }
  }
}
