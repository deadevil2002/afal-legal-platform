import {
  collection,
  onSnapshot,
  orderBy,
  query,
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
import { Request } from "@/components/RequestCard";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useT } from "@/hooks/useT";

function sortByDate(a: Request, b: Request): number {
  const toMs = (ts: unknown): number => {
    if (!ts) return 0;
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.getTime();
  };
  return toMs(b.createdAt) - toMs(a.createdAt);
}

interface RequestsContextValue {
  requests: Request[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const RequestsContext = createContext<RequestsContextValue>({
  requests: [],
  loading: true,
  error: null,
  refresh: () => {},
});

export function RequestsProvider({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, loading: authLoading } = useAuth();
  const { t } = useT();

  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const resultsRef = useRef<Map<string, Request>>(new Map());

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    // Wait until auth has fully loaded AND role has been resolved.
    // Without this guard the admin query fires before activeSuperAdminEmail
    // is fetched from settings/app, causing Super Admin to appear as a regular
    // user on first load (showing an empty requests list).
    if (authLoading) return;

    if (!profile) {
      setLoading(false);
      setRequests([]);
      return;
    }

    // If role isn't resolved yet (empty string edge case), wait.
    if (!profile.role) return;

    setError(null);
    setLoading(true);
    resultsRef.current.clear();

    const flush = () => {
      const sorted = Array.from(resultsRef.current.values()).sort(sortByDate);
      setRequests(sorted);
      setLoading(false);
    };

    if (isAdmin) {
      const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
      return onSnapshot(
        q,
        (snap) => {
          resultsRef.current.clear();
          snap.docs.forEach((d) =>
            resultsRef.current.set(d.id, { id: d.id, ...d.data() } as Request)
          );
          flush();
        },
        () => {
          setError(t("errGeneric"));
          setLoading(false);
        }
      );
    }

    let q1Done = false;
    let q2Done = false;
    const tryFlush = () => {
      if (q1Done && q2Done) flush();
    };

    const q1 = query(
      collection(db, "requests"),
      where("userId", "==", profile.uid)
    );
    const q2 = query(
      collection(db, "requests"),
      where("createdBy", "==", profile.uid)
    );

    const unsub1 = onSnapshot(
      q1,
      (snap) => {
        snap.docs.forEach((d) =>
          resultsRef.current.set(d.id, { id: d.id, ...d.data() } as Request)
        );
        q1Done = true;
        tryFlush();
      },
      () => {
        q1Done = true;
        tryFlush();
      }
    );

    const unsub2 = onSnapshot(
      q2,
      (snap) => {
        snap.docs.forEach((d) =>
          resultsRef.current.set(d.id, { id: d.id, ...d.data() } as Request)
        );
        q2Done = true;
        tryFlush();
      },
      () => {
        q2Done = true;
        tryFlush();
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [profile?.uid, profile?.role, isAdmin, authLoading, tick]);

  return (
    <RequestsContext.Provider value={{ requests, loading, error, refresh }}>
      {children}
    </RequestsContext.Provider>
  );
}

export function useRequests() {
  return useContext(RequestsContext);
}
