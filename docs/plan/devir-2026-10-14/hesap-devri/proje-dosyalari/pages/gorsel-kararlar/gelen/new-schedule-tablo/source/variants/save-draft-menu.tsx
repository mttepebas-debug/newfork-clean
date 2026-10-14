// Stands in for apps/web/src/schedule/components/SaveDraftMenu on the test page.
// A schedule edit gets main's menu (Publish / Save draft). A template opened for
// editing (its pencil in the New Schedule window) gets one "Save template"
// button instead: it writes the edit back into the template, leaves edit mode
// and shows the saved template on the grid again.
import { useToast } from "@newfork/ui";
import { Layers } from "lucide-react";
import { useState, type ComponentProps, type JSX } from "react";
import { SaveDraftMenu as Original } from "../../../src/schedule/components/SaveDraftMenu";
import { post } from "./common";
import { templateNames } from "./template-store";

interface Extra {
  /** The page's edit session (patched in by vite.config.ts). */
  readonly stSessionId?: string;
  /** The page's own "leave edit mode without saving" (no question asked). */
  readonly stDiscard?: () => void;
  /** The page's own preview opener. */
  readonly stPreview?: (draftId: string) => void;
}
type Props = ComponentProps<typeof Original> & Extra;

export function SaveDraftMenu({ stSessionId, stDiscard, stPreview, ...props }: Props): JSX.Element {
  const names = templateNames.use();
  const templateId = props.activeDraftId ?? null;
  const name = templateId ? names.get(templateId)?.name : undefined;
  if (!templateId || name === undefined) return <Original {...props} />;
  return (
    <SaveTemplateButton
      templateId={templateId}
      name={name}
      className={(props.trigger.props as { className?: string }).className ?? ""}
      sessionId={stSessionId ?? null}
      onSaved={() => {
        stDiscard?.();
        window.setTimeout(() => stPreview?.(templateId), 0);
      }}
    />
  );
}

function SaveTemplateButton({ templateId, name, className, sessionId, onSaved }: {
  readonly templateId: string; readonly name: string; readonly className: string;
  readonly sessionId: string | null; readonly onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={className}
      data-schedule-top-action-trigger="publish"
      data-publication-tone="none"
      disabled={pending || !sessionId}
      title={`Save your changes to the template "${name}"`}
      onClick={() => {
        setPending(true);
        post(`/prototype/templates/${templateId}/save-edit`, { session_id: sessionId })
          .then(() => {
            toast.success("Template saved", { description: name });
            templateNames.refresh();
            onSaved();
          }, (error: unknown) => {
            toast.error("Template not saved", { description: error instanceof Error ? error.message : "Try again." });
          })
          .finally(() => setPending(false));
      }}
    >
      <Layers size={15} aria-hidden /> {pending ? "Saving…" : "Save template"}
    </button>
  );
}
