import { useCallback, useRef, useState } from "react";
import type { PastEditFinding } from "../schedule-data";

export interface RetroactiveEditPromptState {
  readonly open: boolean;
  readonly mode: "blocked" | "confirm";
  readonly findings: readonly PastEditFinding[];
  readonly messages: readonly string[];
}

const closedRetroactiveEditPrompt: RetroactiveEditPromptState = {
  open: false,
  mode: "confirm",
  findings: [],
  messages: [],
};

export function useRetroactiveEditPrompt(): {
  readonly state: RetroactiveEditPromptState;
  readonly prompt: (
    mode: "blocked" | "confirm",
    findings: readonly PastEditFinding[],
    messages: readonly string[],
  ) => Promise<boolean>;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
} {
  const [state, setState] = useState<RetroactiveEditPromptState>(
    closedRetroactiveEditPrompt,
  );
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setState(closedRetroactiveEditPrompt);
    resolve?.(confirmed);
  }, []);

  const prompt = useCallback(
    (
      mode: "blocked" | "confirm",
      findings: readonly PastEditFinding[],
      messages: readonly string[],
    ): Promise<boolean> => {
      resolveRef.current?.(false);
      setState({ open: true, mode, findings, messages });
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
      });
    },
    [],
  );

  const onConfirm = useCallback(() => settle(true), [settle]);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) settle(false);
    },
    [settle],
  );

  return { state, prompt, onConfirm, onOpenChange };
}
