import { Button } from "@newfork/ui";
import { Building2, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { saveOwnerOnboarding, supabaseClient } from "../lib/supabase";

export default function OwnerOnboardingPage() {
  const { context, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(
    context?.onboarding.currentStep === 2 ? 2 : 1,
  );
  const [workspaceName, setWorkspaceName] = useState(
    context?.workspace.name ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!context) return null;
  if (
    context.membership.role !== "owner" ||
    context.onboarding.status === "complete"
  ) {
    return <Navigate to="/app" replace />;
  }

  const saveStep = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!supabaseClient) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId: context.workspace.id,
        workspaceName,
        nextStep: 2,
        complete: false,
      });
      setStep(2);
      await refresh();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Setup could not be saved",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const completeSetup = async (): Promise<void> => {
    if (!supabaseClient) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId: context.workspace.id,
        workspaceName,
        nextStep: 2,
        complete: true,
      });
      await refresh();
      navigate("/app/schedule", { replace: true });
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Setup could not be completed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <span className="onboarding-brand">
          <Building2 size={20} aria-hidden /> Newfork
        </span>
        <span className="step-count">Step {step} of 2</span>
      </header>
      <div
        className="onboarding-progress"
        aria-label={"Step " + step + " of 2"}
      >
        <span className="complete" />
        <span className={step === 2 ? "complete" : ""} />
      </div>

      {step === 1 ? (
        <section
          className="onboarding-content"
          aria-labelledby="workspace-identity-title"
        >
          <p className="eyebrow">Workspace identity</p>
          <h1 id="workspace-identity-title">Name your restaurant workspace</h1>
          <p className="muted">
            This name appears in navigation and workspace selection.
          </p>
          <form className="onboarding-form" onSubmit={saveStep}>
            <label htmlFor="workspace-name">Workspace name</label>
            <input
              id="workspace-name"
              value={workspaceName}
              maxLength={120}
              onChange={(event) => setWorkspaceName(event.target.value)}
              autoFocus
              required
            />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="form-actions align-end">
              <Button
                type="submit"
                disabled={submitting || workspaceName.trim().length === 0}
              >
                Continue <ChevronRight size={16} aria-hidden />
              </Button>
            </div>
          </form>
        </section>
      ) : (
        <section
          className="onboarding-content"
          aria-labelledby="workspace-ready-title"
        >
          <div className="completion-icon">
            <Check size={24} aria-hidden />
          </div>
          <p className="eyebrow">Foundation ready</p>
          <h1 id="workspace-ready-title">{workspaceName} is ready</h1>
          <p className="muted">
            Continue to Schedule. Locations, jobs, and team invitations are
            configured from Organization Settings in the next phase.
          </p>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="form-actions">
            <Button
              className="secondary-button"
              type="button"
              onClick={() => setStep(1)}
            >
              <ChevronLeft size={16} aria-hidden /> Back
            </Button>
            <Button type="button" disabled={submitting} onClick={completeSetup}>
              {submitting ? "Finishing" : "Open Schedule"}{" "}
              <ChevronRight size={16} aria-hidden />
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
