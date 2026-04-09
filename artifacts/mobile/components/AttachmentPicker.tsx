/**
 * AttachmentPicker.tsx — Professional attachment picker for Arabian Fal
 *
 * Features:
 * - Polished bottom-sheet modal instead of raw Alert dialog
 * - Full RTL (Arabic) support
 * - Upload progress indicator
 * - Error state with retry hint
 * - Cloudinary backend via lib/cloudinary.ts
 *
 * Folder routing via uploadContext:
 *   { type: "request" }                  → afal/requests/pending
 *   { type: "request", requestId: "x" }  → afal/requests/x
 *   { type: "message", requestId: "x" }  → afal/messages/x
 */

import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  Alert,
  Animated,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import {
  CloudinaryUploadResult,
  formatFileSize,
  getFileIcon,
  isMimeTypeAllowed,
  uploadToCloudinary,
} from "@/lib/cloudinary";

export interface AttachmentMeta {
  fileUrl: string;
  publicId: string;
  fileName: string;
  fileType: string;
  size: number;
  resourceType: string;
  folder: string;
}

export type UploadContext =
  | { type: "request"; requestId?: string }
  | { type: "message"; requestId: string };

function buildFolder(ctx: UploadContext): string {
  if (ctx.type === "request") {
    return ctx.requestId ? `afal/requests/${ctx.requestId}` : "afal/requests/pending";
  }
  return `afal/messages/${ctx.requestId}`;
}

interface UploadingFile {
  name: string;
  progress: number;
  error?: string;
}

interface AttachmentPickerProps {
  attachments: AttachmentMeta[];
  onChange: (attachments: AttachmentMeta[]) => void;
  uploadContext: UploadContext;
  maxFiles?: number;
  disabled?: boolean;
}

export function AttachmentPicker({
  attachments,
  onChange,
  uploadContext,
  maxFiles = 5,
  disabled = false,
}: AttachmentPickerProps) {
  const colors = useColors();
  const { t, isRTL } = useT();
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);

  const canAdd = attachments.length + uploading.length < maxFiles && !disabled;

  const doUpload = async (uri: string, fileName: string, mimeType: string) => {
    const normalizedMime = mimeType.split(";")[0].trim().toLowerCase();

    if (!isMimeTypeAllowed(normalizedMime)) {
      Alert.alert(t("error"), t("unsupportedFileType"));
      return;
    }

    const uploadKey = `${fileName}-${Date.now()}`;
    setUploading((prev) => [...prev, { name: uploadKey, progress: -1 }]);

    try {
      const result: CloudinaryUploadResult = await uploadToCloudinary(
        uri,
        fileName,
        normalizedMime,
        { folder: buildFolder(uploadContext) }
      );
      const meta: AttachmentMeta = {
        fileUrl: result.fileUrl,
        publicId: result.publicId,
        fileName: result.fileName,
        fileType: result.fileType,
        size: result.size,
        resourceType: result.resourceType,
        folder: result.folder,
      };
      onChange([...attachments, meta]);
    } catch (e: unknown) {
      const msg = t("errUpload");
      console.error("[AttachmentPicker] Upload error:", (e as Error).message);
      Alert.alert(t("uploadFailed"), msg);
      setUploading((prev) =>
        prev.map((f) => (f.name === uploadKey ? { ...f, error: msg } : f))
      );
      setTimeout(() => {
        setUploading((prev) => prev.filter((f) => f.name !== uploadKey));
      }, 2500);
      return;
    }

    setUploading((prev) => prev.filter((f) => f.name !== uploadKey));
  };

  // ── Photo library picker (ImagePicker) ──────────────────────────────────
  // Uses expo-image-picker so iOS shows the native Photos UI with proper permissions.
  // "limited" status (iOS 14+ selected-photos access) is accepted — the user still
  // gets to pick from their chosen photos.
  const pickImage = async () => {
    setPickerVisible(false);
    await new Promise((r) => setTimeout(r, 300));
    try {
      if (Platform.OS === "ios") {
        let permStatus: string;
        try {
          const { status } =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          permStatus = status;
        } catch (permErr: unknown) {
          console.error("[AttachmentPicker] requestMediaLibraryPermissionsAsync failed:", permErr);
          Alert.alert(t("error"), t("errGeneric"));
          return;
        }

        // "granted" = full access, "limited" = iOS 14+ selected photos — both are fine.
        if (permStatus !== "granted" && permStatus !== "limited") {
          Alert.alert(
            t("permissionDenied"),
            t("iosPhotoPermissionDenied"),
            [
              { text: t("cancel"), style: "cancel" },
              {
                text: t("openSettings"),
                onPress: () => Linking.openSettings(),
              },
            ]
          );
          return;
        }
      }

      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.85,
          allowsMultipleSelection: false,
        });
      } catch (pickerErr: unknown) {
        console.error("[AttachmentPicker] launchImageLibraryAsync failed:", pickerErr);
        Alert.alert(t("error"), t("errGeneric"));
        return;
      }

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      await doUpload(
        asset.uri,
        asset.fileName || `image_${Date.now()}.jpg`,
        asset.mimeType || "image/jpeg"
      );
    } catch (e: unknown) {
      console.error("[AttachmentPicker] pickImage unexpected error:", e);
      Alert.alert(t("error"), t("errGeneric"));
    }
  };

  // ── Document picker (DocumentPicker) ────────────────────────────────────
  // Uses expo-document-picker which opens the iOS Files / iCloud UI.
  // On iOS: type "*/*" is used because the MIME→UTType mapping is fragile
  //   and causes the picker to throw before opening on some iOS/Expo Go versions.
  // On Android: explicit MIME types are kept for a better filtered picker UI.
  // copyToCacheDirectory: true ensures the local URI is readable for upload.
  const pickDocument = async () => {
    setPickerVisible(false);
    await new Promise((r) => setTimeout(r, 300));
    try {
      const result = await DocumentPicker.getDocumentAsync(
        Platform.OS === "ios"
          ? { type: "*/*", copyToCacheDirectory: true, multiple: false }
          : {
              type: [
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              ],
              copyToCacheDirectory: true,
              multiple: false,
            }
      );
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      await doUpload(asset.uri, asset.name, asset.mimeType || "application/octet-stream");
    } catch (e: unknown) {
      console.error("[AttachmentPicker] pickDocument failed:", e);
      Alert.alert(t("error"), t("errGeneric"));
    }
  };

  const removeAttachment = (index: number) => {
    onChange(attachments.filter((_, i) => i !== index));
  };

  return (
    <View style={styles.container}>
      {/* Uploaded attachments */}
      {attachments.map((att, index) => (
        <View
          key={`${att.publicId}-${index}`}
          style={[
            styles.attachItem,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              flexDirection: isRTL ? "row-reverse" : "row",
            },
          ]}
        >
          <View
            style={[
              styles.fileIconWrap,
              { backgroundColor: colors.primary + "15" },
            ]}
          >
            <Icon name={getFileIcon(att.fileType)} size={18} color={colors.primary} />
          </View>
          <View style={[styles.attachInfo, isRTL && styles.attachInfoRTL]}>
            <Text
              style={[
                styles.attachName,
                { color: colors.foreground, textAlign: isRTL ? "right" : "left" },
              ]}
              numberOfLines={1}
            >
              {att.fileName}
            </Text>
            <Text
              style={[
                styles.attachMeta,
                { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" },
              ]}
            >
              {formatFileSize(att.size)}
              {" · "}
              {(att.fileType.split("/")[1] || att.fileType).toUpperCase()}
            </Text>
          </View>
          {!disabled && (
            <TouchableOpacity
              onPress={() => removeAttachment(index)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.removeBtn}
            >
              <Icon name="x-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* In-progress uploads */}
      {uploading.map((f, index) => (
        <View
          key={`uploading-${index}`}
          style={[
            styles.attachItem,
            {
              backgroundColor: f.error ? "#FEF2F2" : colors.muted,
              borderColor: f.error ? "#FCA5A5" : colors.border,
              flexDirection: isRTL ? "row-reverse" : "row",
            },
          ]}
        >
          <View
            style={[
              styles.fileIconWrap,
              { backgroundColor: f.error ? "#FEE2E2" : colors.primary + "15" },
            ]}
          >
            {f.error ? (
              <Icon name="alert-circle" size={18} color="#DC2626" />
            ) : (
              <UploadSpinner color={colors.primary} />
            )}
          </View>
          <View style={[styles.attachInfo, isRTL && styles.attachInfoRTL]}>
            <Text
              style={[
                styles.attachName,
                {
                  color: f.error ? "#DC2626" : colors.foreground,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
              numberOfLines={1}
            >
              {f.name.replace(/-\d+$/, "")}
            </Text>
            <Text
              style={[
                styles.attachMeta,
                {
                  color: f.error ? "#DC2626" : colors.mutedForeground,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
            >
              {f.error ? f.error : t("uploading")}
            </Text>
          </View>
        </View>
      ))}

      {/* Add button */}
      {canAdd && (
        <TouchableOpacity
          style={[
            styles.addBtn,
            {
              borderColor: colors.border,
              backgroundColor: colors.card,
              flexDirection: isRTL ? "row-reverse" : "row",
            },
          ]}
          onPress={() => setPickerVisible(true)}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <Icon name="paperclip" size={15} color={colors.primary} />
          <Text style={[styles.addBtnText, { color: colors.primary }]}>
            {t("attachFile")}
            {attachments.length > 0 ? ` (${attachments.length}/${maxFiles})` : ""}
          </Text>
        </TouchableOpacity>
      )}

      {/* Professional bottom-sheet picker */}
      <SourcePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPickImage={pickImage}
        onPickDocument={pickDocument}
        isRTL={isRTL}
        colors={colors}
        t={t}
      />
    </View>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function UploadSpinner({ color }: { color: string }) {
  const spin = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        useNativeDriver: false,
      })
    ).start();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: color,
          borderTopColor: "transparent",
        }}
      />
    </Animated.View>
  );
}

// ─── Bottom Sheet Modal ───────────────────────────────────────────────────────

interface SourcePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onPickImage: () => void;
  onPickDocument: () => void;
  isRTL: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  t: (key: import("@/i18n/translations").TranslationKey) => string;
}

function SourcePickerModal({
  visible,
  onClose,
  onPickImage,
  onPickDocument,
  isRTL,
  colors,
  t,
}: SourcePickerModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={modalStyles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                modalStyles.sheet,
                { backgroundColor: colors.card },
              ]}
            >
              {/* Handle bar */}
              <View style={[modalStyles.handle, { backgroundColor: colors.border }]} />

              {/* Title */}
              <Text
                style={[
                  modalStyles.title,
                  {
                    color: colors.foreground,
                    textAlign: isRTL ? "right" : "left",
                  },
                ]}
              >
                {t("chooseFileSource")}
              </Text>
              <Text
                style={[
                  modalStyles.subtitle,
                  {
                    color: colors.mutedForeground,
                    textAlign: isRTL ? "right" : "left",
                  },
                ]}
              >
                {isRTL
                  ? "صور JPEG/PNG أو مستندات PDF/Word"
                  : "JPEG/PNG images or PDF/Word documents"}
              </Text>

              {/* Options */}
              <View style={[modalStyles.options, { borderColor: colors.border }]}>
                <PickerOption
                  icon="image"
                  label={t("imageFromGallery")}
                  sublabel={isRTL ? "JPEG · PNG · WebP" : "JPEG · PNG · WebP"}
                  iconBg="#EFF6FF"
                  iconColor="#2563EB"
                  onPress={onPickImage}
                  isRTL={isRTL}
                  colors={colors}
                />
                <View style={[modalStyles.divider, { backgroundColor: colors.border }]} />
                <PickerOption
                  icon="file-doc"
                  label={t("documentPdfWord")}
                  sublabel={isRTL ? "PDF · DOC · DOCX" : "PDF · DOC · DOCX"}
                  iconBg="#F0FDF4"
                  iconColor="#16A34A"
                  onPress={onPickDocument}
                  isRTL={isRTL}
                  colors={colors}
                />
              </View>

              {/* Cancel */}
              <TouchableOpacity
                style={[
                  modalStyles.cancelBtn,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[modalStyles.cancelText, { color: colors.foreground }]}>
                  {t("cancel")}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

interface PickerOptionProps {
  icon: "image" | "file-doc";
  label: string;
  sublabel: string;
  iconBg: string;
  iconColor: string;
  onPress: () => void;
  isRTL: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}

function PickerOption({
  icon,
  label,
  sublabel,
  iconBg,
  iconColor,
  onPress,
  isRTL,
  colors,
}: PickerOptionProps) {
  return (
    <TouchableOpacity
      style={[
        modalStyles.option,
        { flexDirection: isRTL ? "row-reverse" : "row" },
      ]}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <View style={[modalStyles.optionIcon, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={22} color={iconColor} />
      </View>
      <View style={[modalStyles.optionText, isRTL && modalStyles.optionTextRTL]}>
        <Text
          style={[
            modalStyles.optionLabel,
            { color: colors.foreground, textAlign: isRTL ? "right" : "left" },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            modalStyles.optionSublabel,
            { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" },
          ]}
        >
          {sublabel}
        </Text>
      </View>
      <Icon
        name={isRTL ? "chevron-left" : "chevron-right"}
        size={18}
        color={colors.mutedForeground}
      />
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: 8 },
  attachItem: {
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  attachInfo: { flex: 1 },
  attachInfoRTL: { alignItems: "flex-end" },
  attachName: { fontSize: 13, fontFamily: "Inter_500Medium" },
  attachMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  removeBtn: { padding: 2 },
  addBtn: {
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  options: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: { flex: 1 },
  optionTextRTL: { alignItems: "flex-end" },
  optionLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  optionSublabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  cancelBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
