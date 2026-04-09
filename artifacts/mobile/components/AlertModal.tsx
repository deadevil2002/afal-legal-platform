import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TouchableWithoutFeedback,
} from "react-native";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AlertModalProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
  type?: "info" | "success" | "error" | "warning";
}

const TYPE_CONFIG = {
  info:    { icon: "info" as const,         color: "#2D6491", bg: "#EEF5FB" },
  success: { icon: "check-circle" as const, color: "#22C55E", bg: "#F0FDF4" },
  error:   { icon: "alert-circle" as const, color: "#DC2626", bg: "#FEF2F2" },
  warning: { icon: "alert-triangle" as const, color: "#D97706", bg: "#FFFBEB" },
};

export function AlertModal({
  visible,
  title,
  message,
  buttons,
  onDismiss,
  type = "info",
}: AlertModalProps) {
  const colors = useColors();
  const { t } = useT();
  const cfg = TYPE_CONFIG[type];

  const resolvedButtons: AlertButton[] =
    buttons && buttons.length > 0 ? buttons : [{ text: t("ok"), style: "default" }];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: colors.card }]}>
              <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
                <Icon name={cfg.icon} size={28} color={cfg.color} />
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
              {!!message && (
                <Text style={[styles.message, { color: colors.mutedForeground }]}>
                  {message}
                </Text>
              )}
              <View style={styles.btnRow}>
                {resolvedButtons.map((btn, idx) => {
                  const isDestructive = btn.style === "destructive";
                  const isCancel = btn.style === "cancel";
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.btn,
                        {
                          backgroundColor: isDestructive
                            ? "#DC2626"
                            : isCancel
                            ? colors.muted
                            : colors.primary,
                          flex: resolvedButtons.length > 1 ? 1 : undefined,
                        },
                      ]}
                      onPress={() => {
                        btn.onPress?.();
                        onDismiss?.();
                      }}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.btnText,
                          {
                            color: isCancel ? colors.foreground : "#fff",
                          },
                        ]}
                      >
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  sheet: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 4,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    width: "100%",
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 88,
  },
  btnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
