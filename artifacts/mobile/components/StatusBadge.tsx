import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useT } from "@/hooks/useT";
import { TranslationKey } from "@/i18n/translations";

export type RequestStatus =
  | "Submitted"
  | "Under Review"
  | "Employee Contacted"
  | "In Progress"
  | "Proposed Resolution"
  | "Employee Feedback"
  | "Resolved / Closed"
  | "Escalated";

export type Priority = "low" | "medium" | "high" | "urgent";

interface StatusBadgeProps {
  status?: string;
  priority?: Priority;
}

const STATUS_CONFIG: Record<string, { labelKey: TranslationKey; bg: string; fg: string }> = {
  "Submitted":           { labelKey: "statusSubmitted",         bg: "#FEF9C3", fg: "#854D0E" },
  "Under Review":        { labelKey: "statusUnderReview",       bg: "#DBEAFE", fg: "#1E40AF" },
  "Employee Contacted":  { labelKey: "statusEmployeeContacted", bg: "#E0F2FE", fg: "#0369A1" },
  "In Progress":         { labelKey: "statusInProgress",        bg: "#D1FAE5", fg: "#065F46" },
  "Proposed Resolution": { labelKey: "statusProposedResolution",bg: "#F3E8FF", fg: "#6B21A8" },
  "Employee Feedback":   { labelKey: "statusEmployeeFeedback",  bg: "#FFF7ED", fg: "#C2410C" },
  "Resolved / Closed":   { labelKey: "statusResolvedClosed",    bg: "#DCFCE7", fg: "#166534" },
  "Escalated":           { labelKey: "statusEscalated",         bg: "#FEE2E2", fg: "#991B1B" },
  pending:               { labelKey: "statusSubmitted",         bg: "#FEF9C3", fg: "#854D0E" },
  in_progress:           { labelKey: "statusInProgress",        bg: "#D1FAE5", fg: "#065F46" },
  resolved:              { labelKey: "statusResolved",           bg: "#DCFCE7", fg: "#166534" },
  closed:                { labelKey: "statusClosed",             bg: "#F3F4F6", fg: "#374151" },
};

const PRIORITY_CONFIG: Record<Priority, { labelKey: TranslationKey; bg: string; fg: string }> = {
  low:    { labelKey: "priorityLow",    bg: "#F3F4F6", fg: "#374151" },
  medium: { labelKey: "priorityMedium", bg: "#FEF9C3", fg: "#854D0E" },
  high:   { labelKey: "priorityHigh",   bg: "#FEE2E2", fg: "#991B1B" },
  urgent: { labelKey: "priorityUrgent", bg: "#F3E8FF", fg: "#6B21A8" },
};

export function StatusBadge({ status, priority }: StatusBadgeProps) {
  const { t } = useT();

  if (status) {
    const s = STATUS_CONFIG[status];
    const label = s ? t(s.labelKey) : status;
    const bg = s?.bg ?? "#F3F4F6";
    const fg = s?.fg ?? "#374151";
    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.text, { color: fg }]}>{label}</Text>
      </View>
    );
  }

  if (priority) {
    const p = PRIORITY_CONFIG[priority];
    const label = p ? t(p.labelKey) : priority;
    const bg = p?.bg ?? "#F3F4F6";
    const fg = p?.fg ?? "#374151";
    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.text, { color: fg }]}>{label}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  text: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
