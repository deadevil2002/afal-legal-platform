import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useT } from "@/hooks/useT";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcurementRequest {
  id: string;
  requestNumber: string | null;
  createdByUid: string;
  createdByName: string;
  createdByRole: string;
  createdByEmployeeNumber: string;
  createdAt: unknown;
  updatedAt: unknown;
  currentStage: number;
  status: string;
  title: string;
  groupOrRequesterName: string;
  productDescription: string;
  requestAttachments: unknown[];
  selectedSupplierResponseId: string | null;
  quotationRejectedAt: unknown | null;
  quotationRejectionReason: string | null;
  prNumber: string | null;
  approvedBudgetSar: number | null;
  poNumber: string | null;
  poAttachment: unknown | null;
  requiresEVPCEO: boolean;
  showFullWorkflow: boolean;
  paymentStatus: string;
  isActive: boolean;
  isTerminated: boolean;
  terminatedBy: string | null;
  terminationReason: string | null;
  terminatedAt: unknown | null;
  closedAt: unknown | null;
  closedBy: string | null;
}

export interface CreateRFQParams {
  title: string;
  groupOrRequesterName: string;
  productDescription: string;
}

interface ProcurementRequestsContextValue {
  procurementRequests: ProcurementRequest[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createRFQ: (params: CreateRFQParams) => Promise<string>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ProcurementRequestsContext = createContext<ProcurementRequestsContextValue>({
  procurementRequests: [],
  loading: true,
  error: null,
  refresh: () => {},
  createRFQ: async () => {
    throw new Error("ProcurementRequestsProvider not mounted");
  },
});

// ─── Sort helper ──────────────────────────────────────────────────────────────

function sortByDate(a: ProcurementRequest, b: ProcurementRequest): number {
  const toMs = (ts: unknown): number => {
    if (!ts) return 0;
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };
  return toMs(b.createdAt) - toMs(a.createdAt);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ProcurementRequestsProvider({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, loading: authLoading, user, isSuperAdmin } = useAuth();
  const { t } = useT();

  const [procurementRequests, setProcurementRequests] = useState<ProcurementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const resultsRef = useRef<Map<string, ProcurementRequest>>(new Map());
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    // Wait for auth to finish loading AND for Firebase Auth user to be confirmed.
    // Without the `user` guard, Firestore queries can fire before the auth token
    // propagates to Firestore, causing spurious permission-denied errors.
    if (authLoading) return;

    if (!user || !profile) {
      setLoading(false);
      setProcurementRequests([]);
      return;
    }

    if (!profile.role) return;

    setError(null);
    setLoading(true);
    resultsRef.current.clear();

    const flush = () => {
      const sorted = Array.from(resultsRef.current.values()).sort(sortByDate);
      setProcurementRequests(sorted);
      setLoading(false);
    };

    // Super Admin and assistant_admin see all requests.
    // Operational roles (ceo, evp, etc.) see only requests they created.
    const shouldRunAdminQuery = isSuperAdmin || profile.role === "assistant_admin";

    console.log("[ProcurementCtx] user.uid:", user?.uid);
    console.log("[ProcurementCtx] profile.role:", profile?.role);
    console.log("[ProcurementCtx] isSuperAdmin:", isSuperAdmin);
    console.log("[ProcurementCtx] shouldRunAdminQuery:", shouldRunAdminQuery);
    console.log("[ProcurementCtx] query:", shouldRunAdminQuery ? "ADMIN (all docs, orderBy createdAt)" : "USER (createdByUid == " + user?.uid + ")");

    if (shouldRunAdminQuery) {
      const q = query(
        collection(db, "procurement_requests"),
        orderBy("createdAt", "desc")
      );
      return onSnapshot(
        q,
        (snap) => {
          resultsRef.current.clear();
          snap.docs.forEach((d) =>
            resultsRef.current.set(d.id, { id: d.id, ...d.data() } as ProcurementRequest)
          );
          flush();
        },
        (err) => {
          console.error("[ProcurementCtx] admin query failed — code:", err.code, "| message:", err.message);
          setError(t("errGeneric"));
          setLoading(false);
        }
      );
    }

    const q = query(
      collection(db, "procurement_requests"),
      where("createdByUid", "==", profile.uid)
    );
    return onSnapshot(
      q,
      (snap) => {
        resultsRef.current.clear();
        snap.docs.forEach((d) =>
          resultsRef.current.set(d.id, { id: d.id, ...d.data() } as ProcurementRequest)
        );
        flush();
      },
      (err) => {
        console.error("[ProcurementCtx] user query failed:", err.code, err.message);
        setError(t("errGeneric"));
        setLoading(false);
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?.uid, profile?.role, isSuperAdmin, authLoading, tick]);

  // ─── createRFQ ─────────────────────────────────────────────────────────────

  const createRFQ = useCallback(
    async (params: CreateRFQParams): Promise<string> => {
      if (!user || !profile) throw new Error("Not authenticated");

      const now = serverTimestamp();

      const requestDoc = {
        requestNumber: null,
        createdByUid: user.uid,
        createdByName: profile.displayName,
        createdByRole: profile.role,
        createdByEmployeeNumber: profile.employeeNumber ?? "",
        createdAt: now,
        updatedAt: now,
        currentStage: 1,
        status: "draft",
        title: params.title.trim(),
        groupOrRequesterName: params.groupOrRequesterName.trim() || profile.displayName,
        productDescription: params.productDescription.trim(),
        requestAttachments: [],
        selectedSupplierResponseId: null,
        quotationRejectedAt: null,
        quotationRejectionReason: null,
        prNumber: null,
        approvedBudgetSar: null,
        poNumber: null,
        poAttachment: null,
        requiresEVPCEO: false,
        showFullWorkflow: false,
        paymentStatus: "pending",
        isActive: true,
        isTerminated: false,
        terminatedBy: null,
        terminationReason: null,
        terminatedAt: null,
        closedAt: null,
        closedBy: null,
      };

      const requestRef = await addDoc(collection(db, "procurement_requests"), requestDoc);
      const requestId = requestRef.id;

      // Write initial workflow event.
      // If Firestore rules block this write (e.g. missing canSubmitRequests flag),
      // it fails silently — the request document is already created and is the
      // canonical source of truth. The event is for timeline display only.
      try {
        await addDoc(collection(db, "workflow_events"), {
          requestId,
          actorUid: user.uid,
          actorName: profile.displayName,
          actorRole: profile.role,
          eventType: "request_created",
          fromStage: null,
          toStage: "draft",
          comment: null,
          attachments: [],
          createdAt: now,
          metadata: null,
        });
      } catch (eventErr) {
        console.warn(
          "[ProcurementCtx] workflow_events write blocked (check Firestore rules):",
          (eventErr as Error).message
        );
      }

      return requestId;
    },
    [user, profile]
  );

  return (
    <ProcurementRequestsContext.Provider
      value={{ procurementRequests, loading, error, refresh, createRFQ }}
    >
      {children}
    </ProcurementRequestsContext.Provider>
  );
}

export function useProcurementRequests() {
  return useContext(ProcurementRequestsContext);
}
