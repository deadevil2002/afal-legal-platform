/**
 * DialogContext — enterprise-grade dialog system for AF Procurement Hub.
 *
 * Replaces all Alert.alert() calls with a themed modal dialog.
 * Usage:
 *   const { showDialog, showError, showSuccess, showWarning, showConfirm } = useDialog();
 *
 * showDialog(opts)          – full control (title, message, type, buttons)
 * showError(msg, title?)    – red alert-circle icon
 * showSuccess(msg, title?)  – green check-circle icon
 * showWarning(msg, title?)  – amber alert-triangle icon
 * showConfirm(opts)         – two-button confirmation
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { AlertButton, AlertModal } from "@/components/AlertModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DialogOptions {
  title: string;
  message?: string;
  type?: "info" | "success" | "error" | "warning";
  buttons?: AlertButton[];
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  type?: "info" | "success" | "error" | "warning";
  destructive?: boolean;
}

interface DialogContextValue {
  showDialog: (opts: DialogOptions) => void;
  showError: (message: string, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showConfirm: (opts: ConfirmOptions) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const DialogContext = createContext<DialogContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState<DialogOptions>({
    title: "",
    type: "info",
    buttons: [],
  });

  // Queue so rapid back-to-back calls don't drop dialogs
  const queueRef = useRef<DialogOptions[]>([]);
  const showingRef = useRef(false);

  const presentNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      showingRef.current = false;
      return;
    }
    setOpts(next);
    setVisible(true);
    showingRef.current = true;
  }, []);

  const showDialog = useCallback(
    (options: DialogOptions) => {
      queueRef.current.push(options);
      if (!showingRef.current) presentNext();
    },
    [presentNext]
  );

  const showError = useCallback(
    (message: string, title = "Error") => {
      showDialog({ title, message, type: "error" });
    },
    [showDialog]
  );

  const showSuccess = useCallback(
    (message: string, title = "Success") => {
      showDialog({ title, message, type: "success" });
    },
    [showDialog]
  );

  const showWarning = useCallback(
    (message: string, title = "Warning") => {
      showDialog({ title, message, type: "warning" });
    },
    [showDialog]
  );

  const showConfirm = useCallback(
    (confirmOpts: ConfirmOptions) => {
      showDialog({
        title: confirmOpts.title,
        message: confirmOpts.message,
        type: confirmOpts.type ?? "warning",
        buttons: [
          {
            text: confirmOpts.cancelText ?? "Cancel",
            style: "cancel",
            onPress: confirmOpts.onCancel,
          },
          {
            text: confirmOpts.confirmText,
            style: confirmOpts.destructive ? "destructive" : "default",
            onPress: confirmOpts.onConfirm,
          },
        ],
      });
    },
    [showDialog]
  );

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(presentNext, 300);
  }, [presentNext]);

  return (
    <DialogContext.Provider
      value={{ showDialog, showError, showSuccess, showWarning, showConfirm }}
    >
      {children}
      <AlertModal
        visible={visible}
        title={opts.title}
        message={opts.message}
        type={opts.type ?? "info"}
        buttons={opts.buttons}
        onDismiss={handleDismiss}
      />
    </DialogContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}
