export const unpaidBreakMinuteOptions = [0, 15, 30, 45, 60] as const;

const quickEditorWidth = 304;
const quickEditorHeight = 520;
const quickEditorViewportPadding = 8;
const quickEditorPointerOffset = 10;

export function clampQuickEditorPosition(
  x: number,
  y: number,
  viewport: {
    readonly width: number;
    readonly height: number;
  } = readQuickEditorViewport(),
): { readonly x: number; readonly y: number } {
  return {
    x: Math.max(
      quickEditorViewportPadding,
      Math.min(
        x,
        viewport.width - quickEditorWidth - quickEditorViewportPadding,
      ),
    ),
    y: Math.max(
      quickEditorViewportPadding,
      Math.min(
        y,
        viewport.height - quickEditorHeight - quickEditorViewportPadding,
      ),
    ),
  };
}

export function getQuickEditorInitialPosition(
  x: number,
  y: number,
  viewport?: {
    readonly width: number;
    readonly height: number;
  },
): { readonly x: number; readonly y: number } {
  return clampQuickEditorPosition(
    x + quickEditorPointerOffset,
    y,
    viewport,
  );
}

export function formatUnpaidBreakOption(minutes: number): string {
  return minutes === 0 ? "None" : `${minutes}m`;
}

function readQuickEditorViewport(): {
  readonly width: number;
  readonly height: number;
} {
  if (typeof window === "undefined") {
    return {
      width: quickEditorWidth + quickEditorViewportPadding * 2,
      height: quickEditorHeight + quickEditorViewportPadding * 2,
    };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}
