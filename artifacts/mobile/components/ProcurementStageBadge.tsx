import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { getStageBadgeConfig } from "@/constants/procurementStages";
import { useT } from "@/hooks/useT";

interface ProcurementStageBadgeProps {
  stage: string;
}

export function ProcurementStageBadge({ stage }: ProcurementStageBadgeProps) {
  const { t } = useT();
  const config = getStageBadgeConfig(stage);

  return (
    <View style={[styles.pill, { backgroundColor: config.bg }]}>
      <Text style={[styles.label, { color: config.fg }]}>
        {t(config.labelKey as Parameters<typeof t>[0])}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
});
