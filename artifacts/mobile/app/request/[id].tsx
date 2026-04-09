import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AttachmentMeta, AttachmentPicker } from "@/components/AttachmentPicker";
import { Icon } from "@/components/Icon";
import { AttachmentViewer } from "@/components/AttachmentViewer";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { Request, CATEGORY_KEY_MAP } from "@/components/RequestCard";
import { UserProfileModal } from "@/components/UserProfileModal";
import { TranslationKey } from "@/i18n/translations";

const STATUS_OPTIONS = [
  "Submitted",
  "Under Review",
  "Employee Contacted",
  "In Progress",
  "Proposed Resolution",
  "Employee Feedback",
  "Resolved / Closed",
  "Escalated",
] as const;

type RequestStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_KEY_MAP: Record<RequestStatus, TranslationKey> = {
  "Submitted":             "statusSubmitted",
  "Under Review":          "statusUnderReview",
  "Employee Contacted":    "statusEmployeeContacted",
  "In Progress":           "statusInProgress",
  "Proposed Resolution":   "statusProposedResolution",
  "Employee Feedback":     "statusEmployeeFeedback",
  "Resolved / Closed":     "statusResolvedClosed",
  "Escalated":             "statusEscalated",
};

const STATUS_DOT_COLORS: Record<RequestStatus, string> = {
  "Submitted":             "#D97706",
  "Under Review":          "#1E40AF",
  "Employee Contacted":    "#0369A1",
  "In Progress":           "#065F46",
  "Proposed Resolution":   "#6B21A8",
  "Employee Feedback":     "#C2410C",
  "Resolved / Closed":     "#166534",
  "Escalated":             "#991B1B",
};

interface Message {
  id: string;
  requestId: string;
  userId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  attachments?: Array<{
    fileUrl?: string;
    url?: string;
    fileName: string;
    fileType?: string;
    mimeType?: string;
    size?: number;
    publicId?: string;
    resourceType?: string;
    folder?: string;
  }>;
  createdAt: unknown;
}

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { t, isRTL } = useT();
  const { user, profile, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [request, setRequest] = useState<Request | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [msgAttachments, setMsgAttachments] = useState<AttachmentMeta[]>([]);
  const [showAttachments, setShowAttachments] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const updateRequestStatus = async (newStatus: RequestStatus) => {
    if (!id) return;
    setUpdatingStatus(true);
    try {
      const now = serverTimestamp();
      const payload: Record<string, unknown> = {
        status: newStatus,
        statusChangedAt: now,
        statusChangedBy: profile?.uid ?? null,
      };
      if (newStatus === "Resolved / Closed") {
        payload.closedAt = now;
        payload.closedBy = profile?.uid ?? null;
      }
      await updateDoc(doc(db, "requests", id), payload);
      setShowStatusModal(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      Alert.alert(t("error"), (e as Error).message ?? t("errGeneric"));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const reopenRequest = async () => {
    if (!id || !isSuperAdmin) return;
    try {
      await updateDoc(doc(db, "requests", id), {
        status: "In Progress",
        statusChangedAt: serverTimestamp(),
        statusChangedBy: profile?.uid ?? null,
        closedAt: null,
        closedBy: null,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      Alert.alert(t("error"), (e as Error).message ?? t("errGeneric"));
    }
  };

  useEffect(() => {
    if (!id) return;

    // Subscribe to the request document
    const unsubReq = onSnapshot(
      doc(db, "requests", id),
      (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as Request;
          setRequest(data);
          // Mark as viewed by this user — clears the green "new request" dot for them
          if (user && !data.viewedBy?.[user.uid]) {
            updateDoc(doc(db, "requests", id), { [`viewedBy.${user.uid}`]: true }).catch(() => {});
          }
        }
        setLoading(false);
      },
      () => setLoading(false)
    );

    // Subscribe to messages from top-level request_messages collection
    // Requires Firestore index: requestId (ASC) + createdAt (ASC)
    const msgQuery = query(
      collection(db, "request_messages"),
      where("requestId", "==", id),
      orderBy("createdAt", "asc")
    );
    const unsubMsg = onSnapshot(
      msgQuery,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
      },
      () => {
        // Permission error or missing index — silently fail, messages just won't load
      }
    );

    return () => {
      unsubReq();
      unsubMsg();
    };
  }, [id]);

  const sendMessage = async () => {
    const hasText = messageText.trim().length > 0;
    const hasAttachments = msgAttachments.length > 0;
    if (!hasText && !hasAttachments) return;
    if (!user || !profile || !id || !request) return;
    // Hard-stop: never allow messages on a closed request (UI + data layer guard)
    if (request.status === "Resolved / Closed") return;
    setSending(true);
    const text = messageText.trim();
    const attachmentsToSend = [...msgAttachments];
    setMessageText("");
    setMsgAttachments([]);
    setShowAttachments(false);
    try {
      const requestOwnerId = request.userId || request.createdBy || user.uid;
      await addDoc(collection(db, "request_messages"), {
        requestId: id,
        userId: requestOwnerId,
        senderId: user.uid,
        senderName: profile.displayName,
        senderRole: profile.role,
        text,
        attachments: attachmentsToSend.map((a) => ({
          fileUrl: a.fileUrl,
          publicId: a.publicId,
          fileName: a.fileName,
          fileType: a.fileType,
          size: a.size,
          resourceType: a.resourceType,
          folder: a.folder,
          uploadedByUid: user.uid,
          requestId: id,
        })),
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "requests", id), {
        messageCount: increment(1),
        updatedAt: serverTimestamp(),
        // Clear the viewed state for all OTHER parties so they see the dot again
        ...(isAdmin
          ? { [`viewedBy.${request.userId ?? request.createdBy}`]: false }
          : {}
        ),
      });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_e) {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts: unknown): string => {
    if (!ts) return "";
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="alert-circle" size={40} color={colors.border} />
        <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", marginTop: 12 }}>
          {t("requestNotFound")}
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLocked = request.status === "Resolved / Closed";

  const rawCategory = request.category || request.type || "";
  const displayCategory = rawCategory
    ? (CATEGORY_KEY_MAP[rawCategory] ? t(CATEGORY_KEY_MAP[rawCategory] as Parameters<typeof t>[0]) : rawCategory)
    : "";

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.uid;
    const isSuperAdminOrAdmin =
      item.senderRole === "assistant_admin" ||
      item.senderRole === "super_admin" ||
      item.senderRole === "admin";
    const bubbleBg = isMe
      ? colors.primary
      : isSuperAdminOrAdmin
      ? colors.secondary
      : colors.card;
    const textColor = isMe || isSuperAdminOrAdmin ? "#fff" : colors.foreground;
    const subColor = isMe || isSuperAdminOrAdmin ? "rgba(255,255,255,0.7)" : colors.mutedForeground;

    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {!isMe && (
          <View style={[styles.avatarSmall, { backgroundColor: isSuperAdminOrAdmin ? colors.secondary : colors.muted }]}>
            <Text style={[styles.avatarSmallText, { color: isSuperAdminOrAdmin ? "#fff" : colors.mutedForeground }]}>
              {item.senderName?.charAt(0)?.toUpperCase() || "?"}
            </Text>
          </View>
        )}
        <View style={{ maxWidth: "75%" }}>
          {!isMe && (
            <Text style={[styles.senderName, { color: isSuperAdminOrAdmin ? colors.secondary : colors.mutedForeground }]}>
              {item.senderName}
              {isSuperAdminOrAdmin ? ` · ${t("staffBadge")}` : ""}
            </Text>
          )}
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: bubbleBg,
                borderColor: isMe || isSuperAdminOrAdmin ? "transparent" : colors.border,
              },
            ]}
          >
            {!!item.text && (
              <Text style={[styles.msgText, { color: textColor }]}>{item.text}</Text>
            )}
            {item.attachments && item.attachments.length > 0 && (
              <View style={[styles.attachList, item.text ? { marginTop: 8 } : {}]}>
                {item.attachments.map((att, idx) => (
                  <AttachmentViewer
                    key={idx}
                    attachment={att}
                    style={[
                      styles.attachBubble,
                      { backgroundColor: isMe || isSuperAdminOrAdmin ? "rgba(255,255,255,0.2)" : colors.muted },
                    ]}
                    iconColor={isMe || isSuperAdminOrAdmin ? "#fff" : colors.primary}
                    textColor={isMe || isSuperAdminOrAdmin ? "#fff" : colors.foreground}
                  />
                ))}
              </View>
            )}
            <Text style={[styles.msgTime, { color: subColor }]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
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
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {request.title}
          </Text>
          <View style={styles.headerBadges}>
            <StatusBadge status={request.status} />
            <StatusBadge priority={request.priority} />
          </View>
        </View>
      </View>

      {/* Request Info Bar */}
      <View style={[styles.reqInfo, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {!!displayCategory && (
          <View style={[styles.categoryTag, { backgroundColor: colors.primary + "12" }]}>
            <Icon name="tag" size={11} color={colors.primary} />
            <Text style={[styles.categoryText, { color: colors.primary }]}>
              {displayCategory}
            </Text>
          </View>
        )}
        {isAdmin && !!(request.createdByName || request.userId || request.createdBy) && (() => {
          const senderUid = request.userId ?? request.createdBy ?? null;
          const senderName = request.createdByName || senderUid || "Unknown";
          return senderUid ? (
            <TouchableOpacity
              onPress={() => setProfileModalUserId(senderUid)}
              activeOpacity={0.7}
              style={styles.submitterRow}
            >
              <Icon name="person" size={12} color={colors.primary} />
              <Text style={[styles.submitterText, { color: colors.primary }]}>
                {senderName}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.submitterRow}>
              <Icon name="person" size={12} color={colors.mutedForeground} />
              <Text style={[styles.submitterText, { color: colors.mutedForeground }]}>
                {senderName}
              </Text>
            </View>
          );
        })()}
        <Text style={[styles.reqDescription, { color: colors.mutedForeground }]} numberOfLines={3}>
          {request.description}
        </Text>

        {/* Request-level attachments — files submitted with the original request */}
        {!!request.attachments && request.attachments.length > 0 && (
          <View style={styles.reqAttachSection}>
            <View style={styles.reqAttachHeader}>
              <Icon name="paperclip" size={12} color={colors.mutedForeground} />
              <Text style={[styles.reqAttachTitle, { color: colors.mutedForeground }]}>
                {t("attachmentsLabel")} · {request.attachments.length}
              </Text>
            </View>
            {request.attachments.map((att, idx) => (
              <AttachmentViewer
                key={`req-att-${idx}`}
                attachment={att}
                style={[
                  styles.reqAttachItem,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
                iconColor={colors.primary}
                textColor={colors.foreground}
              />
            ))}
          </View>
        )}
      </View>

      {/* Admin Action Bar — visible only to admins */}
      {isAdmin && (
        <View
          style={[
            styles.adminBar,
            { backgroundColor: "#112B4D", borderBottomColor: colors.border },
          ]}
        >
          <View style={styles.adminBarLeft}>
            <Icon name="shield-check" size={13} color={colors.accent} />
            <Text style={styles.adminBarLabel}>{t("adminActions")}</Text>
          </View>
          <TouchableOpacity
            style={[styles.adminBarBtn, { backgroundColor: colors.accent }]}
            onPress={() => setShowStatusModal(true)}
          >
            <Icon name="refresh" size={13} color="#fff" />
            <Text style={styles.adminBarBtnText}>{t("changeStatus")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 && styles.emptyList,
        ]}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Icon name="chat-bubble-dots" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {t("noMessages")}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
              {t("startConversation")}
            </Text>
          </View>
        }
      />

      {/* Attachment Picker (shown when toggled) */}
      {showAttachments && (
        <View
          style={[
            styles.attachmentPanel,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <AttachmentPicker
            attachments={msgAttachments}
            onChange={setMsgAttachments}
            uploadContext={{ type: "message", requestId: id ?? "" }}
            maxFiles={3}
            disabled={sending}
          />
        </View>
      )}

      {/* Admin Status Update Modal */}
      <Modal
        visible={showStatusModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStatusModal(false)}
        statusBarTranslucent
      >
        <View style={styles.statusOverlay}>
          <View style={[styles.statusSheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.statusSheetTitle, { color: colors.foreground }]}>
              {t("updateStatus")}
            </Text>
            {request && (
              <Text style={[styles.statusSheetSub, { color: colors.mutedForeground }]} numberOfLines={2}>
                {request.title}
              </Text>
            )}
            <ScrollView
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {STATUS_OPTIONS.map((s, i) => {
                const isCurrent = request?.status === s;
                const isUpdatingThis = updatingStatus && isCurrent;
                const dotColor = STATUS_DOT_COLORS[s] ?? colors.mutedForeground;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.statusOptionRow,
                      i > 0 && { marginTop: 8 },
                      {
                        borderColor: isCurrent ? colors.primary : colors.border,
                        backgroundColor: isCurrent
                          ? colors.primary + "12"
                          : colors.background,
                      },
                    ]}
                    onPress={() => updateRequestStatus(s)}
                    disabled={updatingStatus}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[styles.statusDot, { backgroundColor: dotColor }]}
                    />
                    <Text
                      style={[
                        styles.statusOptionLabel,
                        {
                          color: isCurrent ? colors.primary : colors.foreground,
                          fontFamily: isCurrent
                            ? "Inter_700Bold"
                            : "Inter_500Medium",
                        },
                      ]}
                    >
                      {t(STATUS_KEY_MAP[s])}
                    </Text>
                    {isUpdatingThis ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : isCurrent ? (
                      <Icon name="check-circle" size={20} color={colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.statusCancelBtn, { borderColor: colors.border }]}
              onPress={() => setShowStatusModal(false)}
              disabled={updatingStatus}
            >
              <Text style={[styles.statusCancelText, { color: colors.foreground }]}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Locked Request Banner */}
      {isLocked && (
        <View
          style={[
            styles.lockedBanner,
            {
              backgroundColor: "#FFF8E7",
              borderTopColor: "#F5C842",
              paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8),
            },
          ]}
        >
          <Icon name="lock" size={18} color="#B7860D" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.lockedBannerText, { color: "#7A5A00" }]}>
              {t("requestClosedMsg")}
            </Text>
          </View>
          {isSuperAdmin && (
            <TouchableOpacity
              style={[styles.reopenBtn, { backgroundColor: colors.primary }]}
              onPress={reopenRequest}
            >
              <Icon name="refresh" size={14} color="#fff" />
              <Text style={styles.reopenBtnText}>{t("reopenRequest")}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Input Bar — hidden when request is locked */}
      {!isLocked && (
      <View
        style={[
          styles.inputBar,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.card,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8),
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.attachBtn,
            {
              backgroundColor: showAttachments ? colors.primary + "20" : colors.muted,
            },
          ]}
          onPress={() => setShowAttachments(!showAttachments)}
        >
          <Icon
            name="paperclip"
            size={18}
            color={
              showAttachments
                ? colors.primary
                : msgAttachments.length > 0
                ? colors.secondary
                : colors.mutedForeground
            }
          />
          {msgAttachments.length > 0 && (
            <View style={[styles.attachBadge, { backgroundColor: colors.secondary }]}>
              <Text style={styles.attachBadgeText}>{msgAttachments.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TextInput
          style={[
            styles.msgInput,
            { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border },
          ]}
          value={messageText}
          onChangeText={setMessageText}
          placeholder={t("typeMessage")}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            {
              backgroundColor:
                messageText.trim() || msgAttachments.length > 0
                  ? colors.primary
                  : colors.muted,
            },
          ]}
          onPress={sendMessage}
          disabled={(!messageText.trim() && msgAttachments.length === 0) || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Icon
              name="send"
              size={18}
              color={
                messageText.trim() || msgAttachments.length > 0
                  ? "#fff"
                  : colors.mutedForeground
              }
            />
          )}
        </TouchableOpacity>
      </View>
      )}
      <UserProfileModal userId={profileModalUserId} onClose={() => setProfileModalUserId(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  headerBadges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  reqInfo: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 6,
  },
  categoryTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  submitterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  submitterText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  reqDescription: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 22 },
  reqAttachSection: { gap: 6, marginTop: 4 },
  reqAttachHeader: { flexDirection: "row", alignItems: "center", gap: 5 },
  reqAttachTitle: { fontSize: 11, fontFamily: "Inter_500Medium" },
  reqAttachItem: { borderRadius: 8, borderWidth: 1 },
  messageList: { padding: 16, gap: 12 },
  emptyList: { flexGrow: 1 },
  emptyMessages: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 60 },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  emptyHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  msgRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  msgRowMe: { flexDirection: "row-reverse" },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarSmallText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  senderName: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 3, marginLeft: 2 },
  bubble: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "right", marginTop: 3 },
  attachmentPanel: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  msgInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  attachList: { gap: 6 },
  attachBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attachBubbleText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },

  // ── Locked Request Banner ─────────────────────────────────────────────
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 2,
  },
  lockedBannerText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  reopenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  reopenBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Admin Action Bar ──────────────────────────────────────────────────
  adminBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  adminBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  adminBarLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  adminBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  adminBarBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Status Bottom Sheet ───────────────────────────────────────────────
  statusOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  statusSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 34,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#DDD",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 18,
  },
  statusSheetTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  statusSheetSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 16,
  },
  statusOptionRow: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  statusOptionLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  statusCancelBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  statusCancelText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
