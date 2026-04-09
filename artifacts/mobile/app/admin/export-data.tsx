import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import ExcelJS from "exceljs";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirestoreTS { toDate?: () => Date }

interface RawRequest {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  type?: string;
  priority?: string;
  status?: string;
  userId?: string;
  createdBy?: string;
  createdByName?: string;
  createdByAdminUid?: string;
  createdByAdmin?: boolean;
  createdByEmployeeNumber?: string;
  targetEmployeeUid?: string;
  targetEmployeeName?: string;
  targetEmployeeNumber?: string;
  messageCount?: number;
  attachments?: Array<{
    fileType?: string;
    mimeType?: string;
    fileName?: string;
    resourceType?: string;
  }>;
  createdAt?: FirestoreTS | null;
  updatedAt?: FirestoreTS | null;
  [key: string]: unknown;
}

interface RawUser {
  uid?: string;
  email?: string;
  displayName?: string;
  employeeNumber?: string;
  department?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
  language?: string;
  createdAt?: FirestoreTS | null;
  updatedAt?: FirestoreTS | null;
  [key: string]: unknown;
}

interface RawDeletion {
  id: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  employeeNumber?: string;
  reason?: string;
  status?: string;
  createdAt?: FirestoreTS | null;
  reviewedAt?: FirestoreTS | null;
  reviewedBy?: string;
  [key: string]: unknown;
}

interface RawAuditLog {
  id: string;
  type?: string;
  previousSuperAdmin?: string;
  previousSuperAdminUid?: string;
  newSuperAdmin?: string;
  newSuperAdminUid?: string;
  transferredBy?: string;
  transferredAt?: FirestoreTS | null;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tsToStr = (ts: FirestoreTS | null | undefined): string => {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const boolToStr = (val: unknown): string => {
  if (val === true) return "YES";
  if (val === false) return "NO";
  return "";
};

const attachmentLabel = (att: {
  fileType?: string;
  mimeType?: string;
  fileName?: string;
  resourceType?: string;
}): string => {
  const mime = (att.fileType ?? att.mimeType ?? "").toLowerCase();
  const name = (att.fileName ?? "").toLowerCase();
  if (mime.startsWith("image/") || att.resourceType === "image") return "PICTURE";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx")
  )
    return "WORD";
  return "FILE";
};

const normalizeCategory = (raw: string): string => {
  const map: Record<string, string> = {
    amicable_settlement: "Amicable Settlement",
    amicaable_settlement: "Amicable Settlement",
    complaint: "Complaint",
    legal_consultation: "Legal Consultation",
    investigation_request: "Investigation Request",
    contract_issue: "Contract Issue",
    violation_report: "Violation Report",
  };
  return map[raw] ?? raw;
};

// ─── ExcelJS styling ──────────────────────────────────────────────────────────

const PRIMARY_ARGB   = "FF2D6491";
const PRIMARY_DARK   = "FF1A4A70";
const STRIPE_ODD     = "FFEEF5FB";
const STRIPE_EVEN    = "FFFFFFFF";
const TEXT_ARGB      = "FF1A1A2E";
const BORDER_C_HDR   = { argb: PRIMARY_DARK };
const BORDER_C_DATA  = { argb: "FFD0DCE8" };

const styleWorksheet = (
  ws: ExcelJS.Worksheet,
  wrapCols: number[]      = [],
  rightCols: number[]     = [],
) => {
  // ── Header row ──
  ws.getRow(1).height = 26;
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
    cell.font      = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: PRIMARY_ARGB } };
    cell.border    = {
      top:    { style: "thin",   color: BORDER_C_HDR },
      bottom: { style: "medium", color: BORDER_C_HDR },
      left:   { style: "thin",   color: BORDER_C_HDR },
      right:  { style: "thin",   color: BORDER_C_HDR },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
  });

  // ── Freeze first row ──
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1, topLeftCell: "A2", activeCell: "A1" }];

  // ── Data rows ──
  for (let r = 2; r <= ws.rowCount; r++) {
    const isOdd = r % 2 === 0;            // row 2 = first data row → "odd" visually
    const row   = ws.getRow(r);
    row.height  = 18;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col0 = colNumber - 1;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isOdd ? STRIPE_ODD : STRIPE_EVEN },
      };
      cell.border = {
        top:    { style: "thin", color: BORDER_C_DATA },
        bottom: { style: "thin", color: BORDER_C_DATA },
        left:   { style: "thin", color: BORDER_C_DATA },
        right:  { style: "thin", color: BORDER_C_DATA },
      };
      cell.font      = { size: 10, color: { argb: TEXT_ARGB } };
      cell.alignment = {
        horizontal: rightCols.includes(col0) ? "right" : "left",
        vertical:   "top",
        wrapText:   wrapCols.includes(col0),
      };
    });
  }
};

// ─── Buffer → base64 (Hermes-safe, no btoa, no spread) ───────────────────────
//
// ExcelJS writeBuffer() can return:
//   • Node.js Buffer  (Uint8Array subclass)  — the common case in RN/Expo
//   • plain ArrayBuffer                      — browser / some polyfill paths
//
// We normalise to Uint8Array first, then encode manually.
// We do NOT use btoa() or the spread operator because:
//   • btoa("…") rejects any byte >255 in some environments
//   • String.fromCharCode(...chunk) blows Hermes's limited call stack
//
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const bufferToBase64 = (raw: Buffer | ArrayBuffer | Uint8Array): string => {
  // Normalise to Uint8Array without copying data where possible
  let u8: Uint8Array;
  if (raw instanceof Uint8Array) {
    u8 = raw;                                    // Buffer is a Uint8Array subclass
  } else {
    u8 = new Uint8Array(raw as ArrayBuffer);
  }

  const len = u8.length;
  let out   = "";

  for (let i = 0; i < len; i += 3) {
    const b0 = u8[i];
    const b1 = i + 1 < len ? u8[i + 1] : 0;
    const b2 = i + 2 < len ? u8[i + 2] : 0;

    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < len ? B64_CHARS[b2 & 63]                       : "=";
  }

  return out;
};

// ─── Sheet builders ───────────────────────────────────────────────────────────

const buildRequestsSheet = (
  wb: ExcelJS.Workbook,
  requests: RawRequest[],
  usersMap: Map<string, RawUser>,
) => {
  const ws = wb.addWorksheet("Requests", { tabColor: { argb: PRIMARY_ARGB } });

  ws.columns = [
    { header: "Request ID",            key: "rid",            width: 24 },
    { header: "Title",                 key: "title",          width: 30 },
    { header: "Description",           key: "description",    width: 42 },
    { header: "Category",              key: "category",       width: 22 },
    { header: "Priority",              key: "priority",       width: 12 },
    { header: "Status",                key: "status",         width: 22 },
    { header: "Created At",            key: "createdAt",      width: 20 },
    { header: "Updated At",            key: "updatedAt",      width: 20 },
    { header: "Employee Name",         key: "empName",        width: 24 },
    { header: "Employee Email",        key: "empEmail",       width: 28 },
    { header: "Employee Number",       key: "empNum",         width: 16 },
    { header: "Target Employee Name",  key: "tgtName",        width: 24 },
    { header: "Target Employee Email", key: "tgtEmail",       width: 28 },
    { header: "Target Employee No.",   key: "tgtNum",         width: 16 },
    { header: "Created By Admin",      key: "byAdmin",        width: 16 },
    { header: "Admin Creator UID",     key: "adminUid",       width: 28 },
    { header: "Attachments",           key: "attachments",    width: 24 },
    { header: "Messages Count",        key: "messageCount",   width: 14 },
  ];

  for (const req of requests) {
    const ownerUid    = req.userId ?? req.createdBy ?? "";
    const owner       = usersMap.get(ownerUid);
    const targetOwner = req.targetEmployeeUid ? usersMap.get(req.targetEmployeeUid) : undefined;
    const attachLabel = (req.attachments ?? []).map(attachmentLabel).join(", ");
    const priority    = (req.priority ?? "").charAt(0).toUpperCase() + (req.priority ?? "").slice(1);

    ws.addRow([
      req.id,
      req.title ?? "",
      req.description ?? "",
      normalizeCategory(req.category ?? req.type ?? ""),
      priority,
      req.status ?? "",
      tsToStr(req.createdAt),
      tsToStr(req.updatedAt),
      owner?.displayName ?? req.createdByName ?? "",
      owner?.email ?? "",
      owner?.employeeNumber ?? req.createdByEmployeeNumber ?? "",
      req.targetEmployeeName ?? targetOwner?.displayName ?? "",
      targetOwner?.email ?? "",
      req.targetEmployeeNumber ?? targetOwner?.employeeNumber ?? "",
      boolToStr(req.createdByAdmin),
      req.createdByAdminUid ?? "",
      attachLabel,
      req.messageCount ?? 0,
    ]);
  }

  // col index 2 = Description (wrap), col 17 = Messages Count (right-align)
  styleWorksheet(ws, [2], [17]);
};

const buildUsersSheet = (wb: ExcelJS.Workbook, users: RawUser[]) => {
  const ws = wb.addWorksheet("Users", { tabColor: { argb: "FF16A8BA" } });

  ws.columns = [
    { header: "User ID",         key: "uid",     width: 28 },
    { header: "Full Name",       key: "name",    width: 24 },
    { header: "Email",           key: "email",   width: 30 },
    { header: "Employee Number", key: "empNum",  width: 16 },
    { header: "Department",      key: "dept",    width: 20 },
    { header: "Phone",           key: "phone",   width: 16 },
    { header: "Role",            key: "role",    width: 18 },
    { header: "Active",          key: "active",  width: 8  },
    { header: "Language",        key: "lang",    width: 10 },
    { header: "Created At",      key: "created", width: 20 },
    { header: "Updated At",      key: "updated", width: 20 },
  ];

  for (const u of users) {
    const roleLabel =
      u.role === "super_admin"
        ? "Super Admin"
        : u.role === "assistant_admin"
        ? "Assistant Admin"
        : "Regular User";

    ws.addRow([
      u.uid ?? "",
      u.displayName ?? "",
      u.email ?? "",
      u.employeeNumber ?? "",
      u.department ?? "",
      u.phone ?? "",
      roleLabel,
      boolToStr(u.isActive),
      u.language === "ar" ? "Arabic" : "English",
      tsToStr(u.createdAt),
      tsToStr(u.updatedAt),
    ]);
  }

  styleWorksheet(ws, [], []);
};

const buildDeletionSheet = (wb: ExcelJS.Workbook, deletions: RawDeletion[]) => {
  const ws = wb.addWorksheet("Deletion Requests", { tabColor: { argb: "FFD97706" } });

  ws.columns = [
    { header: "Request ID",      key: "id",         width: 24 },
    { header: "User ID",         key: "userId",     width: 28 },
    { header: "Full Name",       key: "name",       width: 22 },
    { header: "Email",           key: "email",      width: 30 },
    { header: "Employee Number", key: "empNum",     width: 16 },
    { header: "Reason",          key: "reason",     width: 38 },
    { header: "Status",          key: "status",     width: 12 },
    { header: "Created At",      key: "created",    width: 20 },
    { header: "Reviewed At",     key: "reviewed",   width: 20 },
    { header: "Reviewed By",     key: "reviewedBy", width: 28 },
  ];

  for (const d of deletions) {
    const statusLabel =
      d.status === "approved" ? "Approved"
      : d.status === "rejected" ? "Rejected"
      : d.status === "closed"   ? "Closed"
      : "Pending";

    ws.addRow([
      d.id,
      d.userId ?? "",
      d.userName ?? "",
      d.userEmail ?? "",
      d.employeeNumber ?? "",
      d.reason ?? "",
      statusLabel,
      tsToStr(d.createdAt),
      tsToStr(d.reviewedAt),
      d.reviewedBy ?? "",
    ]);
  }

  // col 5 = Reason (wrap)
  styleWorksheet(ws, [5], []);
};

const buildAuditSheet = (wb: ExcelJS.Workbook, logs: RawAuditLog[]) => {
  const ws = wb.addWorksheet("Audit Logs", { tabColor: { argb: "FFBC9B5D" } });

  ws.columns = [
    { header: "Log ID",        key: "id",          width: 24 },
    { header: "Action",        key: "action",      width: 24 },
    { header: "Actor UID",     key: "actorUid",    width: 28 },
    { header: "Actor Email",   key: "actorEmail",  width: 30 },
    { header: "Target UID",    key: "targetUid",   width: 28 },
    { header: "Target Email",  key: "targetEmail", width: 30 },
    { header: "Timestamp",     key: "ts",          width: 20 },
    { header: "Details",       key: "details",     width: 42 },
  ];

  for (const log of logs) {
    const actionLabel = log.type === "super_admin_transfer" ? "Super Admin Transfer" : (log.type ?? "");
    const details = log.type === "super_admin_transfer"
      ? `${log.previousSuperAdmin ?? ""} → ${log.newSuperAdmin ?? ""}`
      : "";

    ws.addRow([
      log.id,
      actionLabel,
      log.previousSuperAdminUid ?? log.transferredBy ?? "",
      log.previousSuperAdmin ?? "",
      log.newSuperAdminUid ?? "",
      log.newSuperAdmin ?? "",
      tsToStr(log.transferredAt),
      details,
    ]);
  }

  // col 7 = Details (wrap)
  styleWorksheet(ws, [7], []);
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExportDataScreen() {
  const colors  = useColors();
  const { t, isRTL } = useT();
  const { isSuperAdmin } = useAuth();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress]   = useState("");

  if (!isSuperAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Icon name="lock" size={48} color={colors.border} />
        <Text style={[styles.denied, { color: colors.foreground }]}>{t("accessDenied")}</Text>
      </View>
    );
  }

  const doExport = async () => {
    setExporting(true);
    setProgress(t("exportFetchingData"));
    try {
      // ── 1. Fetch all data ─────────────────────────────────────────────────
      const [reqSnap, usersSnap, deletionSnap, auditSnap] = await Promise.all([
        getDocs(query(collection(db, "requests"),          orderBy("createdAt",    "desc"))),
        getDocs(collection(db, "users")),
        getDocs(query(collection(db, "deletion_requests"), orderBy("createdAt",    "desc"))),
        getDocs(query(collection(db, "audit_logs"),        orderBy("transferredAt","desc"))).catch(() => null),
      ]);

      setProgress(t("exportBuildingWorkbook"));

      const requests  = reqSnap.docs.map((d)  => ({ id: d.id,  ...d.data() } as RawRequest));
      const users     = usersSnap.docs.map((d) => ({ ...d.data(), uid: d.id } as RawUser));
      const deletions = deletionSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RawDeletion));
      const audits: RawAuditLog[] = auditSnap
        ? auditSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RawAuditLog))
        : [];

      const usersMap = new Map<string, RawUser>();
      for (const u of users) {
        if (u.uid) usersMap.set(u.uid, u);
      }

      // ── 2. Build workbook with ExcelJS ────────────────────────────────────
      const wb = new ExcelJS.Workbook();
      wb.creator  = "Arabian Fal Legal Services";
      wb.created  = new Date();
      wb.modified = new Date();

      buildRequestsSheet(wb, requests, usersMap);
      buildUsersSheet(wb, users);
      buildDeletionSheet(wb, deletions);
      if (audits.length > 0) {
        buildAuditSheet(wb, audits);
      }

      // ── 3. Write to buffer ────────────────────────────────────────────────
      setProgress(t("exportSavingFile"));
      const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `arabian_fal_export_${dateStr}.xlsx`;

      // writeBuffer() returns Buffer (Node.js Uint8Array subclass) in RN/Expo
      const rawBuffer = await wb.xlsx.writeBuffer();
      console.log("[Export] rawBuffer type:", Object.prototype.toString.call(rawBuffer));
      console.log("[Export] rawBuffer byteLength:", (rawBuffer as ArrayBuffer).byteLength ?? (rawBuffer as Uint8Array).length);

      if (Platform.OS === "web") {
        // ── Web path (unchanged) ────────────────────────────────────────────
        const base64  = bufferToBase64(rawBuffer as Buffer | ArrayBuffer | Uint8Array);
        const byteArr = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const blob    = new Blob([byteArr], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a   = document.createElement("a");
        a.href     = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert(t("exportComplete"), `${filename} ${t("exportDownloadSuccess")}`);
      } else {
        // ── Native path — platform-specific ────────────────────────────────

        // Step 1: safe base64 conversion (pure-JS, no btoa, no spread)
        const base64 = bufferToBase64(rawBuffer as Buffer | ArrayBuffer | Uint8Array);
        console.log("[Export][native] base64 length:", base64.length);
        console.log("[Export][native] cacheDirectory:", FileSystem.cacheDirectory);
        console.log("[Export][native] documentDirectory:", FileSystem.documentDirectory);

        const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

        if (Platform.OS === "android") {
          // ── Android: SAF first, then path-cascade fallback ─────────────────
          // expo-file-system's native bridge may not initialise correctly in
          // some Expo Go builds (SDK mismatch). We guard every API call with
          // an existence check and cascade through alternatives.

          const SAF = FileSystem.StorageAccessFramework;
          const hasSAF =
            SAF != null &&
            typeof SAF.requestDirectoryPermissionsAsync === "function" &&
            typeof SAF.createFileAsync === "function";

          console.log("[Export][android] hasSAF:", hasSAF);

          if (hasSAF) {
            // ── Path A: Storage Access Framework (shows native "Save to…" picker)
            const perm = await SAF.requestDirectoryPermissionsAsync();
            console.log("[Export][android] SAF perm:", JSON.stringify(perm));

            if (!perm.granted) {
              Alert.alert(t("exportComplete"), t("exportPermissionDenied"));
              return;
            }

            const safUri = await SAF.createFileAsync(
              perm.directoryUri,
              `arabian_fal_export_${dateStr}`,
              XLSX_MIME,
            );
            console.log("[Export][android] SAF URI:", safUri);

            await FileSystem.writeAsStringAsync(safUri, base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            console.log("[Export][android] SAF write OK");
            Alert.alert(t("exportComplete"), `${filename} ${t("exportDownloadSuccess")}`);

          } else {
            // ── Path B: direct writeAsStringAsync with cascading directories ──
            // SAF is undefined (Expo Go native bridge not initialised).
            // Try several known-writable locations in order; use the first one
            // that accepts a write, then share via expo-sharing.
            const candidateDirs: (string | null | undefined)[] = [
              FileSystem.cacheDirectory,
              FileSystem.documentDirectory,
              "file:///data/user/0/host.exp.exponent/cache/",
              "file:///data/data/host.exp.exponent/cache/",
            ];

            let saved = false;
            for (const dir of candidateDirs) {
              if (!dir) {
                console.log("[Export][android] skipping null/empty dir");
                continue;
              }
              const uri = dir.endsWith("/") ? `${dir}${filename}` : `${dir}/${filename}`;
              console.log("[Export][android] trying:", uri);
              try {
                await FileSystem.writeAsStringAsync(uri, base64, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                console.log("[Export][android] write OK at:", uri);

                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(uri, {
                    mimeType:    XLSX_MIME,
                    dialogTitle: t("exportDialogTitle"),
                  });
                } else {
                  Alert.alert(t("exportComplete"), `${t("exportSavingFile")}: ${uri}`);
                }
                saved = true;
                break;
              } catch (pathErr) {
                console.log("[Export][android] path failed:", uri, (pathErr as Error).message);
              }
            }

            if (!saved) {
              // Nothing worked — expo-file-system native bridge is completely broken.
              // Give the user a clear, actionable message.
              Alert.alert(
                t("error"),
                `${t("exportFailed")}\n\n` +
                "File system access is not available in this environment. " +
                "Please use the web version of the app to export Excel files.",
              );
            }
          }

        } else {
          // ── iOS: cacheDirectory is always valid + shareAsync ──────────────
          // On iOS cacheDirectory never returns null; we use it + the share sheet.
          const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
          if (!dir) throw new Error("cacheDirectory and documentDirectory are both unavailable on this iOS device.");
          const fileUri = dir.endsWith("/") ? `${dir}${filename}` : `${dir}/${filename}`;
          console.log("[Export][ios] writing to:", fileUri);

          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          console.log("[Export][ios] write succeeded");

          const info = await FileSystem.getInfoAsync(fileUri);
          console.log("[Export][ios] file info:", JSON.stringify(info));
          if (!info.exists) throw new Error(`File not found after write: ${fileUri}`);

          const canShare = await Sharing.isAvailableAsync();
          console.log("[Export][ios] canShare:", canShare);
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType:    XLSX_MIME,
              dialogTitle: t("exportDialogTitle"),
              UTI:         "com.microsoft.excel.xlsx",
            });
            console.log("[Export][ios] shareAsync resolved");
          } else {
            Alert.alert(t("exportComplete"), `${t("exportSavingFile")}: ${fileUri}`);
          }
        }
      }
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      console.error("[Export] FAILED — message:", err.message, "code:", err.code ?? "n/a");
      Alert.alert(t("error"), `${t("exportFailed")}\n\n${err.message ?? ""}`);
    } finally {
      setExporting(false);
      setProgress("");
    }
  };

  const SHEETS = [
    {
      icon: "document-text" as const,
      label: t("exportSheetRequests"),
      desc:  t("exportSheetRequestsDesc"),
    },
    {
      icon: "people" as const,
      label: t("exportSheetUsers"),
      desc:  t("exportSheetUsersDesc"),
    },
    {
      icon: "trash" as const,
      label: t("exportSheetDeletion"),
      desc:  t("exportSheetDeletionDesc"),
    },
    {
      icon: "shield-check" as const,
      label: t("exportSheetAudit"),
      desc:  t("exportSheetAuditDesc"),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: "#0C233C",
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, isRTL && { textAlign: "right" }]}>
            {t("exportData")}
          </Text>
          <Text style={[styles.headerSub, isRTL && { textAlign: "right" }]}>
            {t("exportHeaderNote")}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Info box */}
        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Icon name="info-circle" size={14} color={colors.secondary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            {t("exportInfoFull")}
          </Text>
        </View>

        {/* Sheet preview cards */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t("exportWorksheetsLabel")}
        </Text>
        {SHEETS.map((sheet, idx) => (
          <View
            key={sheet.label}
            style={[styles.sheetCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.sheetNum, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[styles.sheetNumText, { color: colors.primary }]}>{idx + 1}</Text>
            </View>
            <View style={styles.sheetInfo}>
              <View style={styles.sheetRow}>
                <Icon name={sheet.icon} size={14} color={colors.primary} />
                <Text style={[styles.sheetName, { color: colors.foreground }]}>{sheet.label}</Text>
              </View>
              <Text style={[styles.sheetDesc, { color: colors.mutedForeground }]}>{sheet.desc}</Text>
            </View>
          </View>
        ))}

        {/* Privacy warning */}
        <View style={[styles.noteBox, { backgroundColor: "#D9770610", borderColor: "#D97706" }]}>
          <Icon name="warning" size={14} color="#D97706" />
          <Text style={[styles.noteText, { color: colors.foreground }]}>
            {t("exportPrivacyWarning")}
          </Text>
        </View>

        {/* Export button */}
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.primary }, exporting && { opacity: 0.7 }]}
          onPress={doExport}
          disabled={exporting}
        >
          {exporting ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.exportBtnText}>{progress || t("exporting")}</Text>
            </>
          ) : (
            <>
              <Icon name="download" size={18} color="#fff" />
              <Text style={styles.exportBtnText}>{t("exportAllDataBtn")}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  denied:    { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  header: {
    flexDirection:  "row",
    alignItems:     "center",
    paddingHorizontal: 16,
    paddingBottom:  20,
    gap: 12,
  },
  backBtn:     { padding: 4 },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub:   { color: "#ffffff99", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  scroll:      { padding: 16, gap: 12 },
  infoBox: {
    flexDirection:  "row",
    gap:            10,
    borderWidth:    1,
    borderRadius:   10,
    padding:        14,
    alignItems:     "flex-start",
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  sectionLabel: {
    fontSize:      11,
    fontFamily:    "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginTop:     4,
    marginBottom:  4,
  },
  sheetCard: {
    flexDirection: "row",
    gap:           12,
    borderWidth:   1,
    borderRadius:  10,
    padding:       14,
    alignItems:    "center",
  },
  sheetNum: {
    width:         32,
    height:        32,
    borderRadius:  16,
    alignItems:    "center",
    justifyContent:"center",
  },
  sheetNumText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sheetInfo:    { flex: 1, gap: 4 },
  sheetRow:     { flexDirection: "row", alignItems: "center", gap: 6 },
  sheetName:    { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sheetDesc:    { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  noteBox: {
    flexDirection:  "row",
    gap:            10,
    borderWidth:    1,
    borderRadius:   10,
    padding:        14,
    alignItems:     "flex-start",
    marginTop:      4,
  },
  noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  exportBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            10,
    borderRadius:   12,
    paddingVertical:16,
    marginTop:      8,
  },
  exportBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
