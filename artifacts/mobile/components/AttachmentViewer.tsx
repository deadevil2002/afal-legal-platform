import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export interface AttachmentItem {
  fileUrl?: string;
  url?: string;
  fileName: string;
  fileType?: string;
  mimeType?: string;
  size?: number;
  publicId?: string;
  resourceType?: string;
  folder?: string;
}

interface AttachmentViewerProps {
  attachment: AttachmentItem;
  style?: object;
  iconColor?: string;
  textColor?: string;
}

function resolveUrl(att: AttachmentItem): string {
  return att.fileUrl ?? att.url ?? "";
}

function isImage(att: AttachmentItem): boolean {
  const mime = att.fileType ?? att.mimeType ?? "";
  if (mime.startsWith("image/")) return true;
  const url = resolveUrl(att);
  return /\.(jpe?g|png|gif|webp|heic|bmp|svg)(\?|$)/i.test(url);
}

function isPdf(att: AttachmentItem): boolean {
  const mime = att.fileType ?? att.mimeType ?? "";
  if (mime.includes("pdf")) return true;
  const url = resolveUrl(att);
  return /\.pdf(\?|$)/i.test(url);
}

function isWordDoc(att: AttachmentItem): boolean {
  const mime = att.fileType ?? att.mimeType ?? "";
  if (
    mime.includes("word") ||
    mime.includes("msword") ||
    mime.includes("officedocument.wordprocessingml") ||
    mime.includes("opendocument.text")
  )
    return true;
  const url = resolveUrl(att);
  return /\.(docx?|odt|rtf)(\?|$)/i.test(url);
}

function fileAccentColor(att: AttachmentItem, fallback: string): string {
  if (isImage(att)) return "#16A8BA";
  if (isPdf(att)) return "#DC2626";
  if (isWordDoc(att)) return "#2563EB";
  return fallback;
}

function fileBadgeLabel(att: AttachmentItem): string | null {
  if (isPdf(att)) return "PDF";
  if (isWordDoc(att)) return "DOC";
  return null;
}

function fileIconName(att: AttachmentItem): "image" | "file-doc" | "paperclip" {
  if (isImage(att)) return "image";
  if (isPdf(att) || isWordDoc(att)) return "file-doc";
  return "paperclip";
}

/**
 * Appends Cloudinary's fl_attachment flag to force the server to send
 * Content-Disposition: attachment, which triggers a browser/OS download dialog.
 */
function toDownloadUrl(url: string): string {
  if (!url) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}fl_attachment=true`;
}

/**
 * Open a URL on the correct platform.
 *   Web    → anchor element click (user-gesture-safe, avoids popup blockers)
 *   Native → Linking.openURL, then Sharing.shareAsync, then WebBrowser
 */
async function openUrl(url: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    return;
  }

  try {
    await Linking.openURL(url);
    return;
  } catch (_) {
    // fall through
  }

  const sharingAvailable = await Sharing.isAvailableAsync().catch(() => false);
  if (sharingAvailable) {
    await Sharing.shareAsync(url);
    return;
  }

  await WebBrowser.openBrowserAsync(url).catch(() => null);
}

export function AttachmentViewer({
  attachment,
  style,
  iconColor,
  textColor,
}: AttachmentViewerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();

  const [imageOpen, setImageOpen] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);

  const url = resolveUrl(attachment);
  const image = isImage(attachment);
  const accent = fileAccentColor(attachment, iconColor ?? colors.primary);
  const badge = fileBadgeLabel(attachment);

  // ── Image handlers ─────────────────────────────────────────────────────
  const handleImagePress = () => {
    if (!url) {
      Alert.alert(t("error"), t("errNotFound"));
      return;
    }
    setImgLoading(true);
    setImgError(false);
    setImageOpen(true);
  };

  const handleImageDownload = () => {
    openUrl(toDownloadUrl(url)).catch(() =>
      openUrl(url).catch(() => Alert.alert(t("error"), t("errGeneric")))
    );
  };

  // ── Non-image handlers ─────────────────────────────────────────────────
  const handleOpenFile = async () => {
    if (!url) {
      Alert.alert(t("error"), t("errNotFound"));
      return;
    }
    setOpenFailed(false);
    try {
      await openUrl(url);
    } catch {
      setOpenFailed(true);
    }
  };

  const handleDownloadFile = () => {
    const dlUrl = toDownloadUrl(url);
    openUrl(dlUrl).catch(() =>
      openUrl(url).catch(() => Alert.alert(t("error"), t("errGeneric")))
    );
  };

  // ── Image: single tappable bubble → fullscreen modal ──────────────────
  if (image) {
    return (
      <>
        <TouchableOpacity
          style={[styles.bubble, style]}
          onPress={handleImagePress}
          activeOpacity={0.7}
        >
          <Icon name="image" size={14} color={iconColor ?? accent} />
          <Text
            style={[styles.bubbleText, { color: textColor ?? colors.foreground }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {attachment.fileName || "Image"}
          </Text>
        </TouchableOpacity>

        <Modal
          visible={imageOpen}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setImageOpen(false)}
          statusBarTranslucent
        >
          <View style={styles.imgOverlay}>
            <View
              style={[
                styles.imgToolbar,
                { paddingTop: Platform.OS === "web" ? 16 : insets.top + 12 },
              ]}
            >
              <TouchableOpacity
                style={styles.toolbarBtn}
                onPress={() => setImageOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="arrow-left" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.toolbarTitle} numberOfLines={1}>
                {attachment.fileName || "Image"}
              </Text>
              <TouchableOpacity
                style={styles.toolbarBtn}
                onPress={handleImageDownload}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="download" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.imgContainer}
              maximumZoomScale={4}
              minimumZoomScale={1}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              centerContent
            >
              {imgError ? (
                <View style={styles.imgErrorWrap}>
                  <Icon name="alert-circle" size={40} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.imgErrorText}>{t("errGeneric")}</Text>
                  <TouchableOpacity
                    style={styles.openExternalBtn}
                    onPress={handleImageDownload}
                  >
                    <Icon name="download" size={16} color="#fff" />
                    <Text style={styles.openExternalText}>Open externally</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {imgLoading && (
                    <ActivityIndicator
                      size="large"
                      color="#fff"
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Image
                    source={{ uri: url }}
                    style={styles.fullImage}
                    resizeMode="contain"
                    onLoadEnd={() => setImgLoading(false)}
                    onError={() => {
                      setImgLoading(false);
                      setImgError(true);
                    }}
                  />
                </>
              )}
            </ScrollView>

            <Pressable
              style={[
                styles.dismissArea,
                { bottom: insets.bottom + (Platform.OS === "web" ? 16 : 8) },
              ]}
              onPress={() => setImageOpen(false)}
            >
              <Text style={styles.dismissText}>Tap to close</Text>
            </Pressable>
          </View>
        </Modal>
      </>
    );
  }

  // ── Non-image (PDF / Word / other): card with Open + Download buttons ──
  return (
    <View style={[styles.fileCard, style]}>
      {/* File info row */}
      <View style={styles.fileInfo}>
        <Icon name={fileIconName(attachment)} size={15} color={iconColor ?? accent} />
        <Text
          style={[styles.bubbleText, { color: textColor ?? colors.foreground, flex: 1 }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {attachment.fileName || "File"}
        </Text>
        {!!badge && (
          <View style={[styles.badgeWrap, { borderColor: iconColor ?? accent }]}>
            <Text style={[styles.badgeText, { color: iconColor ?? accent }]}>
              {badge}
            </Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.fileActions}>
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: colors.primary + "40" }]}
          onPress={handleOpenFile}
          activeOpacity={0.75}
        >
          <Icon name="external-link" size={13} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.primary }]}>
            {t("openFile")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: colors.secondary + "40" }]}
          onPress={handleDownloadFile}
          activeOpacity={0.75}
        >
          <Icon name="download" size={13} color={colors.secondary} />
          <Text style={[styles.actionBtnText, { color: colors.secondary }]}>
            {t("downloadFile")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Open-failed hint */}
      {openFailed && (
        <Text style={[styles.openFailedHint, { color: colors.mutedForeground }]}>
          {t("openFileFailed")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Shared ──────────────────────────────────────────────────────────────
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  bubbleText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  badgeWrap: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },

  // ── Non-image file card ─────────────────────────────────────────────────
  fileCard: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  fileInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fileActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  openFailedHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 2,
  },

  // ── Image viewer ────────────────────────────────────────────────────────
  imgOverlay: {
    flex: 1,
    backgroundColor: "#000",
  },
  imgToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    gap: 12,
  },
  toolbarBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  toolbarTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  imgContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100%",
  },
  fullImage: {
    width: "100%",
    height: "100%",
    minHeight: 300,
  },
  imgErrorWrap: {
    alignItems: "center",
    gap: 12,
    padding: 32,
  },
  imgErrorText: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  openExternalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  openExternalText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  dismissArea: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingVertical: 12,
  },
  dismissText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
