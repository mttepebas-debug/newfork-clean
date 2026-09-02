import { toast as sonnerToast, type ExternalToast } from "sonner";

interface ActionToastOpts {
  readonly actionLabel: string;
  readonly onAction: () => void;
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
  readonly description?: string;
  readonly durationMs?: number;
}

const SUCCESS_TOAST_DURATION_MS = 6_000;
const WARNING_TOAST_DURATION_MS = 12_000;
const INFO_TOAST_DURATION_MS = 10_000;
const ERROR_TOAST_DURATION_MS = 20_000;
const ACTION_TOAST_DURATION_MS = 15_000;

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
  success: (message, opts) =>
    sonnerToast.success(
      message,
      toSonnerOptions(opts, SUCCESS_TOAST_DURATION_MS),
    ),
  error: (message, opts) =>
    sonnerToast.error(message, toSonnerOptions(opts, ERROR_TOAST_DURATION_MS)),
  warning: (message, opts) =>
    sonnerToast.warning(
      message,
      toSonnerOptions(opts, WARNING_TOAST_DURATION_MS),
    ),
  info: (message, opts) =>
    sonnerToast.info(message, toSonnerOptions(opts, INFO_TOAST_DURATION_MS)),
  action: (message, opts) =>
    sonnerToast(message, {
      action: {
        label: opts.actionLabel,
        onClick: opts.onAction,
      },
      dismissible: true,
      duration: opts.durationMs ?? ACTION_TOAST_DURATION_MS,
    }),
};

export function useToast(): ToastFacade {
  return toast;
}
