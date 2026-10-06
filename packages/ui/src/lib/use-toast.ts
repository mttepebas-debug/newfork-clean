import { toast as sonnerToast, type ExternalToast } from "sonner";

interface ActionToastOpts {
  readonly actionLabel: string;
  readonly onAction: () => void;
  readonly dedupeKey?: string;
  readonly durationMs?: number;
}

type ToastResult = string | number;
type ToastFacade = {
  readonly success: (message: string, opts?: ToastOptions) => ToastResult;
  readonly error: (message: string, opts?: ToastOptions) => ToastResult;
  readonly warning: (message: string, opts?: ToastOptions) => ToastResult;
  readonly info: (message: string, opts?: ToastOptions) => ToastResult;
  readonly action: (message: string, opts: ActionToastOpts) => ToastResult;
};

interface ToastOptions {
  readonly dedupeKey?: string;
  readonly description?: string;
  readonly durationMs?: number;
}

const SUCCESS_TOAST_DURATION_MS = 4_000;
const INFO_TOAST_DURATION_MS = 6_000;
const WARNING_TOAST_DURATION_MS = 10_000;
const ERROR_TOAST_DURATION_MS = 14_000;
const ACTION_TOAST_DURATION_MS = 12_000;
const TOAST_DEDUPE_WINDOW_MS = 2_000;

type ToastType = "success" | "error" | "warning" | "info" | "action";

const recentToastIds = new Map<string, { readonly id: ToastResult; readonly expiresAt: number }>();

function normalizeToastText(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function toastDedupeSignature(
  type: ToastType,
  message: string,
  description: string | undefined,
): string {
  return `${type}:${normalizeToastText(message)}:${normalizeToastText(description)}`;
}

function toastDescription(opts: ToastOptions | ActionToastOpts | undefined): string | undefined {
  return opts && "description" in opts ? opts.description : undefined;
}

function resolveToastId(
  type: ToastType,
  message: string,
  opts: ToastOptions | ActionToastOpts | undefined,
): ToastResult | undefined {
  const now = Date.now();
  for (const [key, entry] of recentToastIds) {
    if (entry.expiresAt <= now) recentToastIds.delete(key);
  }
  const key =
    opts?.dedupeKey ??
    toastDedupeSignature(type, message, toastDescription(opts));
  const existing = recentToastIds.get(key);
  if (existing && existing.expiresAt > now) {
    recentToastIds.set(key, {
      id: existing.id,
      expiresAt: now + TOAST_DEDUPE_WINDOW_MS,
    });
    return existing.id;
  }
  return undefined;
}

function rememberToastId(
  type: ToastType,
  message: string,
  opts: ToastOptions | ActionToastOpts | undefined,
  id: ToastResult,
): ToastResult {
  const key =
    opts?.dedupeKey ??
    toastDedupeSignature(type, message, toastDescription(opts));
  recentToastIds.set(key, {
    id,
    expiresAt: Date.now() + TOAST_DEDUPE_WINDOW_MS,
  });
  return id;
}

function toSonnerOptions(
  opts: ToastOptions | undefined,
  duration: number,
): ExternalToast {
  return {
    description: opts?.description,
    dismissible: true,
    duration: opts?.durationMs ?? duration,
  };
}

export const toast: ToastFacade = {
  success: (message, opts) => {
    const id = sonnerToast.success(message, {
      ...toSonnerOptions(opts, SUCCESS_TOAST_DURATION_MS),
      id: resolveToastId("success", message, opts),
    });
    return rememberToastId("success", message, opts, id);
  },
  error: (message, opts) =>
    rememberToastId(
      "error",
      message,
      opts,
      sonnerToast.error(message, {
        ...toSonnerOptions(opts, ERROR_TOAST_DURATION_MS),
        id: resolveToastId("error", message, opts),
      }),
    ),
  warning: (message, opts) => {
    const id = sonnerToast.warning(message, {
      ...toSonnerOptions(opts, WARNING_TOAST_DURATION_MS),
      id: resolveToastId("warning", message, opts),
    });
    return rememberToastId("warning", message, opts, id);
  },
  info: (message, opts) => {
    const id = sonnerToast.info(message, {
      ...toSonnerOptions(opts, INFO_TOAST_DURATION_MS),
      id: resolveToastId("info", message, opts),
    });
    return rememberToastId("info", message, opts, id);
  },
  action: (message, opts) => {
    const id = sonnerToast(message, {
      action: {
        label: opts.actionLabel,
        onClick: opts.onAction,
      },
      dismissible: true,
      duration: opts.durationMs ?? ACTION_TOAST_DURATION_MS,
      id: resolveToastId("action", message, opts),
    });
    return rememberToastId("action", message, opts, id);
  },
};

export function useToast(): ToastFacade {
  return toast;
}
