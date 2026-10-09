import { Button } from "@newfork/ui";
import { Check, Copy, LifeBuoy, Mail } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { SettingsHeader } from "./GeneralSettingsPage";

type CopyState = "idle" | "copied" | "failed";

export default function SupportSettingsPage() {
  const { context } = useAuth();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  if (!context) return null;

  const configuredEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim();
  const supportEmail =
    configuredEmail || (import.meta.env.DEV ? "support@newfork.test" : null);
  const roleName = context.membership.roleName ?? context.membership.role;
  const diagnostics = JSON.stringify(
    {
      workspace_id: context.workspace.id,
      workspace_name: context.workspace.name,
      role: roleName,
      app_origin: window.location.origin,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  );

  const copyDiagnostics = async (): Promise<void> => {
    setCopyState("idle");
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className="settings-page" aria-labelledby="support-settings-title">
      <SettingsHeader
        icon={<LifeBuoy size={21} aria-hidden />}
        title="Support"
        description="Contact support and share only the workspace context needed to investigate an issue."
      />
      <div className="support-panel">
        <section
          className="support-section"
          aria-labelledby="support-contact-title"
        >
          <div>
            <h2 id="support-contact-title">Contact</h2>
            <p>
              Email opens in your configured mail application. No diagnostic
              data is attached automatically.
            </p>
          </div>
          {supportEmail ? (
            <Button
              type="button"
              onClick={() => {
                window.location.href = `mailto:${supportEmail}`;
              }}
            >
              <Mail size={16} aria-hidden />
              Email support
            </Button>
          ) : (
            <span className="support-unavailable">
              Support email is not configured.
            </span>
          )}
        </section>
        <section
          className="support-section support-diagnostics"
          aria-labelledby="support-diagnostics-title"
        >
          <div className="support-section-heading">
            <div>
              <h2 id="support-diagnostics-title">Workspace details</h2>
              <p>
                Copy these non-sensitive details when support asks for workspace
                context.
              </p>
            </div>
            <Button
             
              type="button"
              onClick={() => void copyDiagnostics()}
            >
              {copyState === "copied" ? (
                <Check size={16} aria-hidden />
              ) : (
                <Copy size={16} aria-hidden />
              )}
              {copyState === "copied" ? "Copied" : "Copy diagnostics"}
            </Button>
          </div>
          <dl className="support-details">
            <div>
              <dt>Workspace</dt>
              <dd>{context.workspace.name}</dd>
            </div>
            <div>
              <dt>Workspace ID</dt>
              <dd>{context.workspace.id}</dd>
            </div>
            <div>
              <dt>Effective role</dt>
              <dd>{roleName}</dd>
            </div>
          </dl>
          {copyState === "failed" ? (
            <p className="form-error" role="alert">
              Copy failed. Select the values manually.
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );
}
