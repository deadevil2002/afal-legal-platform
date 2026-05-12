import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProcurementStageBadge } from "@/components/ProcurementStageBadge";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { ProcurementRequest } from "@/context/ProcurementRequestsContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowEvent {
  id: string;
  requestId: string;
  actorUid: string | null;
  actorName: string | null;
  actorRole: string | null;
  eventType: string;
  fromStage: string | null;
  toStage: string | null;
  comment: string | null;
  createdAt: unknown;
  metadata: Record<string, unknown> | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: unknown, isRTL: boolean): string {
  try {
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleString(isRTL ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
      {label.toUpperCase()}
    </Text>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

// ─── Timeline Event ───────────────────────────────────────────────────────────

function TimelineEvent({ event, isLast }: { event: WorkflowEvent; isLast: boolean }) {
  const colors = useColors();
  const { isRTL } = useT();

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
      </View>
      <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.eventType, { color: colors.primary }]}>
          {event.eventType.replace(/_/g, " ")}
        </Text>
        {event.actorName ? (
          <Text style={[styles.eventActor, { color: colors.mutedForeground }]}>
            {event.actorName}
            {event.actorRole ? ` · ${event.actorRole}` : ""}
          </Text>
        ) : null}
        {event.comment ? (
          <Text style={[styles.eventComment, { color: colors.foreground }]}>{event.comment}</Text>
        ) : null}
        {event.toStage ? (
          <View style={{ marginTop: 6 }}>
            <ProcurementStageBadge stage={event.toStage} />
          </View>
        ) : null}
        <Text style={[styles.eventDate, { color: colors.mutedForeground }]}>
          {formatTs(event.createdAt, isRTL)}
        </Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProcurementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t, isRTL } = useT();
  const { profile, isAdmin } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [request, setRequest] = useState<ProcurementRequest | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [loadingRequest, setLoadingRequest] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ── Fetch request ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    setLoadingRequest(true);
    getDoc(doc(db, "procurement_requests", id))
      .then((snap) => {
        if (!snap.exists()) {
          setNotFound(true);
        } else {
          setRequest({ id: snap.id, ...snap.data() } as ProcurementRequest);
        }
      })
      .catch((err) => {
        console.error("[ProcDetail] fetch request:", err.message);
        setNotFound(true);
      })
      .finally(() => setLoadingRequest(false));
  }, [id]);

  // ── Subscribe to workflow events ────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    setLoadingEvents(true);

    const q = query(
      collection(db, "workflow_events"),
      where("requestId", "==", id),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkflowEvent)));
        setLoadingEvents(false);
      },
      (err) => {
        console.warn("[ProcDetail] workflow_events:", err.code, err.message);
        setLoadingEvents(false);
      }
    );
    return unsub;
  }, [id]);

  const dateCreated = useMemo(
    () => (request ? formatTs(request.createdAt, isRTL) : ""),
    [request, isRTL]
  );

  const canView =
    isAdmin ||
    (profile !== null && request !== null && request.createdByUid === profile.uid);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loadingRequest) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // ── Not found / no access ───────────────────────────────────────────────────

  if (notFound || !request || !canView) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="alert-circle" size={48} color={colors.mutedForeground} />
        <Text style={[styles.notFoundText, { color: colors.foreground }]}>
          {t("requestNotFound")}
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium" }}>
            {t("goBack")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.primary,
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {request.requestNumber ?? request.title}
        </Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* Stage badge */}
        <View style={styles.stageRow}>
          <ProcurementStageBadge stage={request.status} />
          {request.requestNumber ? (
            <Text style={[styles.reqNum, { color: colors.primary }]}>
              {request.requestNumber}
            </Text>
          ) : null}
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.foreground }]}>{request.title}</Text>

        {/* Details card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionHeader label={t("requestDetails")} />
          <InfoRow label={t("rfqSubmittedBy")} value={request.createdByName} />
          <InfoRow label={t("rfqGroupOrRequester")} value={request.groupOrRequesterName} />
          <InfoRow label={t("rfqCurrentStage")} value={String(request.currentStage)} />
          <InfoRow label={t("requestedAt")} value={dateCreated} />

          <SectionHeader label={t("rfqProductDescription")} />
          <Text style={[styles.description, { color: colors.foreground }]}>
            {request.productDescription}
          </Text>
        </View>

        {/* Timeline */}
        <View style={styles.timelineSection}>
          <SectionHeader label={t("rfqTimeline")} />
          {loadingEvents ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
          ) : events.length === 0 ? (
            <Text style={[styles.noEvents, { color: colors.mutedForeground }]}>
              {t("noWorkflowEvents")}
            </Text>
          ) : (
            events.map((ev, i) => (
              <TimelineEvent key={ev.id} event={ev} isLast={i === events.length - 1} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 32,
  },
  notFoundText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  scroll: { padding: 20, gap: 16 },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reqNum: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    lineHeight: 28,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 2,
    textAlign: "right",
  },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginTop: 4,
  },
  timelineSection: { gap: 4 },
  noEvents: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  timelineLeft: {
    alignItems: "center",
    width: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
  },
  timelineCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    marginBottom: 4,
  },
  eventType: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  eventActor: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  eventComment: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  eventDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
