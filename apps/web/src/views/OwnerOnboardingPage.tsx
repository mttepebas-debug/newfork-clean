import type { Department, Job, Location } from "@newfork/shared";
import { Button } from "@newfork/ui";
import {
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Send,
  Users,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  loadEmployeeReferenceData,
  saveEmployee,
} from "../employees/employee-data";
import {
  queueOwnerOnboardingInvitationIntent,
  resetOwnerOnboarding,
  saveOwnerOnboarding,
  supabaseClient,
} from "../lib/supabase";
import {
  listDepartments,
  listJobs,
  listLocations,
  saveDepartment,
  saveJob,
  saveLocation,
} from "../settings/organization-data";

type OwnerStep = 1 | 2 | 3 | 4;

const defaultLocation = {
  name: "",
  street_address: "",
  city: "",
  region: "",
  postal_code: "",
  country_code: "US",
  timezone: "America/Los_Angeles",
};

const defaultEmployee = {
  first_name: "",
  last_name: "",
  preferred_name: "",
  invitation_email: "",
  start_date: "",
  internal_note: "",
};

const departmentColor = "#3C7A68";
const jobColor = "#4478A8";

export default function OwnerOnboardingPage() {
  const { account, context, refresh, updateAccount } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<OwnerStep>(
    ownerStepFromContext(context?.onboarding.currentStep),
  );
  const [workspaceName, setWorkspaceName] = useState(
    context?.workspace.name ?? "",
  );
  const [ownerFullName, setOwnerFullName] = useState(
    account?.displayName ?? "",
  );
  const [ownerNameDirty, setOwnerNameDirty] = useState(false);
  const [locationDraft, setLocationDraft] = useState(defaultLocation);
  const [departmentName, setDepartmentName] = useState("");
  const [jobName, setJobName] = useState("");
  const [jobDepartmentId, setJobDepartmentId] = useState("");
  const [employeeDraft, setEmployeeDraft] = useState(defaultEmployee);
  const [inviteAfterSave, setInviteAfterSave] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const workspaceId = context?.workspace.id;
  const ownerOnboardingRevision = context?.onboarding.revision ?? null;

  useEffect(() => {
    if (!account || ownerNameDirty) return;
    setOwnerFullName(account.displayName);
  }, [account, ownerNameDirty]);

  useEffect(() => {
    if (!workspaceId || !supabaseClient) return;
    let active = true;
    setLoading(true);
    void loadOwnerReferences(workspaceId)
      .then((references) => {
        if (!active) return;
        setLocations(references.locations);
        setDepartments(references.departments);
        setJobs(references.jobs);
        setJobDepartmentId(references.departments[0]?.id ?? "");
      })
      .catch((loadError: unknown) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Setup references could not be loaded",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const activeLocations = useMemo(
    () => locations.filter((location) => !location.archived_at),
    [locations],
  );
  const activeDepartments = useMemo(
    () => departments.filter((department) => !department.archived_at),
    [departments],
  );
  const activeJobs = useMemo(
    () => jobs.filter((job) => !job.archived_at),
    [jobs],
  );

  if (!context) return null;
  if (
    context.membership.role !== "owner" ||
    context.onboarding.status === "complete"
  ) {
    return <Navigate to="/app" replace />;
  }

  const refreshOwnerReferences = async (id: string): Promise<void> => {
    const references = await loadOwnerReferences(id);
    setLocations(references.locations);
    setDepartments(references.departments);
    setJobs(references.jobs);
    setJobDepartmentId(
      references.departments.find((department) => !department.archived_at)
        ?.id ?? "",
    );
  };

  const saveWorkspaceIdentity = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!supabaseClient || !workspaceId || !account) return;
    const trimmedOwnerFullName = ownerFullName.trim();
    if (!trimmedOwnerFullName) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await updateAccount(trimmedOwnerFullName, account.theme, account.phone);
      setOwnerNameDirty(false);
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 2,
        complete: false,
        expectedRevision: ownerOnboardingRevision,
      });
      setStep(2);
      await refresh();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Workspace setup could not be saved",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const saveLocationStep = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!supabaseClient || !workspaceId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await saveLocation(workspaceId, locationDraft);
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 2,
        complete: false,
        expectedRevision: ownerOnboardingRevision,
      });
      await refreshOwnerReferences(workspaceId);
      setLocationDraft(defaultLocation);
      setSuccess("Location added");
      await refresh();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Location setup could not be saved",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const continueFromLocations = async (): Promise<void> => {
    if (!supabaseClient || !workspaceId || activeLocations.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 3,
        complete: false,
        expectedRevision: ownerOnboardingRevision,
      });
      setStep(3);
      setSuccess(null);
      await refresh();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Location setup could not be continued",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const saveDepartmentAndJob = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!supabaseClient || !workspaceId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      let departmentId = jobDepartmentId;
      if (!departmentId) {
        await saveDepartment(workspaceId, {
          name: departmentName,
          color: departmentColor,
        });
        const nextDepartments = await listDepartments(workspaceId);
        setDepartments(nextDepartments);
        departmentId =
          nextDepartments.find(
            (department) =>
              department.name.toLowerCase() ===
              departmentName.trim().toLowerCase(),
          )?.id ??
          nextDepartments.find((department) => !department.archived_at)?.id ??
          "";
      }
      await saveJob(workspaceId, {
        name: jobName,
        color: jobColor,
        department_id: departmentId || null,
      });
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 3,
        complete: false,
        expectedRevision: ownerOnboardingRevision,
      });
      await refreshOwnerReferences(workspaceId);
      setDepartmentName("");
      setJobName("");
      setSuccess("Department and job added");
      await refresh();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Department and job setup could not be saved",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const continueFromStructure = async (): Promise<void> => {
    if (
      !supabaseClient ||
      !workspaceId ||
      activeDepartments.length === 0 ||
      activeJobs.length === 0
    )
      return;
    setSubmitting(true);
    setError(null);
    try {
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 4,
        complete: false,
        expectedRevision: ownerOnboardingRevision,
      });
      setStep(4);
      setSuccess(null);
      await refresh();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Team structure setup could not be continued",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const saveTeamMember = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!supabaseClient || !workspaceId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const references = await loadEmployeeReferenceData(workspaceId);
      const locationId = references.locations.find((item) => !item.archived)?.id;
      const jobId = references.jobs.find((item) => !item.archived)?.id;
      if (!locationId || !jobId) {
        throw new Error("Add at least one active location and job first");
      }
      const employeeId = await saveEmployee(workspaceId, {
        ...employeeDraft,
        location_ids: [locationId],
        primary_location_id: locationId,
        job_ids: [jobId],
        primary_job_id: jobId,
        expected_revision: null,
      });
      if (inviteAfterSave && employeeDraft.invitation_email.trim()) {
        await queueOwnerOnboardingInvitationIntent(supabaseClient, {
          workspaceId,
          employeeId,
          email: employeeDraft.invitation_email.trim(),
        });
      }
      setEmployeeDraft(defaultEmployee);
      setSuccess(
        inviteAfterSave && employeeDraft.invitation_email.trim()
          ? "Team member added. Invite will be sent after setup finishes."
          : "Team member added",
      );
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Team member could not be saved",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const completeSetup = async (): Promise<void> => {
    if (!supabaseClient || !workspaceId) return;
    if (employeeDraftHasInput(employeeDraft)) {
      setStep(4);
      setError("Add the employee draft or clear it before finishing setup");
      return;
    }
    if (activeLocations.length === 0) {
      setStep(2);
      setError("Add at least one active location before finishing setup");
      return;
    }
    if (activeDepartments.length === 0 || activeJobs.length === 0) {
      setStep(3);
      setError(
        "Add at least one active department and job before finishing setup",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 4,
        complete: true,
        expectedRevision: ownerOnboardingRevision,
      });
      await refresh();
      navigate("/app/workspace", { replace: true });
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

  const startOver = async (): Promise<void> => {
    if (!supabaseClient || !workspaceId) return;
    if (
      !window.confirm(
        "Start over clears locations, departments, jobs and unsent team drafts from this setup. Continue?",
      )
    ) {
      return;
    }
    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      await resetOwnerOnboarding(supabaseClient, workspaceId);
      setStep(1);
      setLocationDraft(defaultLocation);
      setDepartmentName("");
      setJobName("");
      setJobDepartmentId("");
      setEmployeeDraft(defaultEmployee);
      await refreshOwnerReferences(workspaceId);
      await refresh();
      setSuccess("Setup reset");
    } catch (resetError: unknown) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Setup could not be reset",
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <span className="onboarding-brand">
          <Building2 size={20} aria-hidden /> Newfork
        </span>
        <div className="onboarding-header-actions">
          <Button
            className="secondary-button compact-button"
            type="button"
            disabled={submitting || resetting}
            onClick={startOver}
          >
            {resetting ? "Resetting" : "Start over"}
          </Button>
          <span className="step-count">Step {step} of 4</span>
        </div>
      </header>
      <div
        className="onboarding-progress"
        role="progressbar"
        aria-label="Owner onboarding progress"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={step}
        aria-valuetext={"Step " + step + " of 4"}
      >
        <span className="complete" />
        <span className={step >= 2 ? "complete" : ""} />
        <span className={step >= 3 ? "complete" : ""} />
        <span className={step >= 4 ? "complete" : ""} />
      </div>

      {loading ? (
        <section className="onboarding-content">
          <p className="muted">Loading setup...</p>
        </section>
      ) : null}

      {!loading && step === 1 ? (
        <section
          className="onboarding-content"
          aria-labelledby="workspace-identity-title"
        >
          <p className="eyebrow">Workspace and location</p>
          <h1 id="workspace-identity-title">Name the organization</h1>
          <p className="muted">
            This creates the tenant identity used across the management shell,
            billing, settings, employee records, and schedule surfaces.
          </p>
          <form className="onboarding-form" onSubmit={saveWorkspaceIdentity}>
            <div className="owner-onboarding-grid">
              <label className="wide" htmlFor="owner-full-name">
                Your full name
                <input
                  id="owner-full-name"
                  value={ownerFullName}
                  maxLength={100}
                  onChange={(event) => {
                    setOwnerFullName(event.target.value);
                    setOwnerNameDirty(true);
                  }}
                  autoComplete="name"
                  autoFocus
                  required
                />
              </label>
              <label className="wide" htmlFor="workspace-name">
                Workspace name
                <input
                  id="workspace-name"
                  value={workspaceName}
                  maxLength={120}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  required
                />
              </label>
            </div>
            <Feedback error={error} success={success} />
            <div className="form-actions align-end">
              <Button
                type="submit"
                disabled={
                  submitting ||
                  workspaceName.trim().length === 0 ||
                  ownerFullName.trim().length === 0
                }
              >
                Continue <ChevronRight size={16} aria-hidden />
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {!loading && step === 2 ? (
        <section
          className="onboarding-content"
          aria-labelledby="locations-title"
        >
          <p className="eyebrow">Locations</p>
          <h1 id="locations-title">Add at least one location</h1>
          <p className="muted">
            Locations define where schedules, employee assignments, kiosk
            pairing, and manager scope are anchored.
          </p>
          <form className="onboarding-form" onSubmit={saveLocationStep}>
            <div className="owner-onboarding-grid">
              {activeLocations.length > 0 ? (
                <SummaryList
                  icon={<MapPin size={18} aria-hidden />}
                  title="Locations"
                  items={activeLocations.map((location) => location.name)}
                />
              ) : null}
              <LocationFields
                draft={locationDraft}
                onChange={setLocationDraft}
              />
            </div>
            <Feedback error={error} success={success} />
            <div className="form-actions">
              <Button
                className="secondary-button"
                type="button"
                onClick={() => setStep(1)}
              >
                <ChevronLeft size={16} aria-hidden /> Back
              </Button>
              <div className="onboarding-action-group">
                <Button
                  className="secondary-button"
                  type="submit"
                  disabled={
                    submitting || !locationDraftIsComplete(locationDraft)
                  }
                >
                  <MapPin size={16} aria-hidden /> Add location
                </Button>
                <Button
                  type="button"
                  disabled={submitting || activeLocations.length === 0}
                  onClick={continueFromLocations}
                >
                  Continue <ChevronRight size={16} aria-hidden />
                </Button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {!loading && step === 3 ? (
        <section
          className="onboarding-content"
          aria-labelledby="departments-jobs-title"
        >
          <p className="eyebrow">Departments and jobs</p>
          <h1 id="departments-jobs-title">Create the first team structure</h1>
          <p className="muted">
            Departments and jobs feed schedule coverage, employee records, and
            downstream manager views.
          </p>
          <form className="onboarding-form" onSubmit={saveDepartmentAndJob}>
            <div className="owner-onboarding-grid">
              {activeDepartments.length === 0 ? (
                <label className="wide" htmlFor="department-name">
                  Department
                  <input
                    id="department-name"
                    value={departmentName}
                    maxLength={100}
                    onChange={(event) => setDepartmentName(event.target.value)}
                    placeholder="Front of house"
                    required
                  />
                </label>
              ) : (
                <>
                  <SummaryList
                    icon={<BriefcaseBusiness size={18} aria-hidden />}
                    title="Departments"
                    items={activeDepartments.map(
                      (department) => department.name,
                    )}
                  />
                  <label className="wide" htmlFor="job-department">
                    Department for this job
                    <select
                      id="job-department"
                      value={jobDepartmentId}
                      onChange={(event) =>
                        setJobDepartmentId(event.target.value)
                      }
                    >
                      {activeDepartments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {activeJobs.length > 0 ? (
                <SummaryList
                  icon={<Check size={18} aria-hidden />}
                  title="Jobs"
                  items={activeJobs.map((job) => job.name)}
                />
              ) : null}
              <label className="wide" htmlFor="job-name">
                Job or role
                <input
                  id="job-name"
                  value={jobName}
                  maxLength={100}
                  onChange={(event) => setJobName(event.target.value)}
                  placeholder="Server"
                  required
                />
              </label>
            </div>
            <Feedback error={error} success={success} />
            <div className="form-actions">
              <Button
                className="secondary-button"
                type="button"
                onClick={() => setStep(2)}
              >
                <ChevronLeft size={16} aria-hidden /> Back
              </Button>
              <div className="onboarding-action-group">
                <Button
                  className="secondary-button"
                  type="submit"
                  disabled={
                    submitting ||
                    jobName.trim().length === 0 ||
                    (activeDepartments.length === 0 &&
                      departmentName.trim().length === 0)
                  }
                >
                  <BriefcaseBusiness size={16} aria-hidden /> Add job
                </Button>
                <Button
                  type="button"
                  disabled={
                    submitting ||
                    activeDepartments.length === 0 ||
                    activeJobs.length === 0
                  }
                  onClick={continueFromStructure}
                >
                  Continue <ChevronRight size={16} aria-hidden />
                </Button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {!loading && step === 4 ? (
        <section className="onboarding-content" aria-labelledby="team-title">
          <p className="eyebrow">Team and invitations</p>
          <h1 id="team-title">Add your team</h1>
          <p className="muted">
            This step is optional. Create initial employee records now, or skip
            it and continue from the Employees checklist after setup.
          </p>
          <form className="onboarding-form" onSubmit={saveTeamMember}>
            <div className="owner-onboarding-grid">
              <EmployeeFields
                draft={employeeDraft}
                inviteAfterSave={inviteAfterSave}
                onChange={setEmployeeDraft}
                onInviteChange={setInviteAfterSave}
              />
            </div>
            <Feedback error={error} success={success} />
            <div className="form-actions">
              <Button
                className="secondary-button"
                type="button"
                onClick={() => setStep(3)}
              >
                <ChevronLeft size={16} aria-hidden /> Back
              </Button>
              <div className="onboarding-action-group">
                <Button
                  className="secondary-button"
                  type="submit"
                  disabled={
                    submitting ||
                    employeeDraft.first_name.trim().length === 0 ||
                    employeeDraft.last_name.trim().length === 0
                  }
                >
                  <Users size={16} aria-hidden /> Add employee
                </Button>
                <Button
                  className="secondary-button"
                  type="button"
                  disabled={submitting || !employeeDraftHasInput(employeeDraft)}
                  onClick={() => {
                    setEmployeeDraft(defaultEmployee);
                    setSuccess("Employee draft cleared");
                    setError(null);
                  }}
                >
                  Clear draft
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={completeSetup}
                >
                  {submitting ? "Finishing" : "Skip and finish"}{" "}
                  <ChevronRight size={16} aria-hidden />
                </Button>
              </div>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}

function ownerStepFromContext(currentStep: number | undefined): OwnerStep {
  return currentStep === 4
    ? 4
    : currentStep === 3
      ? 3
      : currentStep === 2
        ? 2
        : 1;
}

function employeeDraftHasInput(draft: typeof defaultEmployee): boolean {
  return [
    draft.first_name,
    draft.last_name,
    draft.invitation_email,
    draft.start_date,
    draft.internal_note,
  ].some((value) => value.trim().length > 0);
}

function LocationFields({
  draft,
  onChange,
}: {
  readonly draft: typeof defaultLocation;
  readonly onChange: (draft: typeof defaultLocation) => void;
}) {
  return (
    <>
      <label htmlFor="location-name">
        Location name
        <input
          id="location-name"
          value={draft.name}
          maxLength={120}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="Main dining room"
          required
        />
      </label>
      <label htmlFor="location-timezone">
        Timezone
        <input
          id="location-timezone"
          value={draft.timezone}
          maxLength={80}
          onChange={(event) =>
            onChange({ ...draft, timezone: event.target.value })
          }
          required
        />
      </label>
      <label className="wide" htmlFor="location-street">
        Street address
        <input
          id="location-street"
          value={draft.street_address}
          maxLength={180}
          onChange={(event) =>
            onChange({ ...draft, street_address: event.target.value })
          }
        />
      </label>
      <label htmlFor="location-city">
        City
        <input
          id="location-city"
          value={draft.city}
          maxLength={100}
          onChange={(event) => onChange({ ...draft, city: event.target.value })}
        />
      </label>
      <label htmlFor="location-region">
        State or region
        <input
          id="location-region"
          value={draft.region}
          maxLength={100}
          onChange={(event) =>
            onChange({ ...draft, region: event.target.value })
          }
        />
      </label>
      <label htmlFor="location-postal">
        Postal code
        <input
          id="location-postal"
          value={draft.postal_code}
          maxLength={20}
          onChange={(event) =>
            onChange({ ...draft, postal_code: event.target.value })
          }
        />
      </label>
      <label htmlFor="location-country">
        Country
        <input
          id="location-country"
          value={draft.country_code}
          maxLength={2}
          onChange={(event) =>
            onChange({
              ...draft,
              country_code: event.target.value.toUpperCase(),
            })
          }
          required
        />
      </label>
    </>
  );
}

function EmployeeFields({
  draft,
  inviteAfterSave,
  onChange,
  onInviteChange,
}: {
  readonly draft: typeof defaultEmployee;
  readonly inviteAfterSave: boolean;
  readonly onChange: (draft: typeof defaultEmployee) => void;
  readonly onInviteChange: (value: boolean) => void;
}) {
  return (
    <>
      <label htmlFor="employee-first-name">
        First name
        <input
          id="employee-first-name"
          value={draft.first_name}
          maxLength={80}
          onChange={(event) =>
            onChange({ ...draft, first_name: event.target.value })
          }
          required
        />
      </label>
      <label htmlFor="employee-last-name">
        Last name
        <input
          id="employee-last-name"
          value={draft.last_name}
          maxLength={80}
          onChange={(event) =>
            onChange({ ...draft, last_name: event.target.value })
          }
          required
        />
      </label>
      <label htmlFor="employee-start-date">
        Start date
        <input
          id="employee-start-date"
          type="date"
          value={draft.start_date}
          onChange={(event) =>
            onChange({ ...draft, start_date: event.target.value })
          }
        />
      </label>
      <label className="wide" htmlFor="employee-email">
        Invitation email
        <input
          id="employee-email"
          type="email"
          value={draft.invitation_email}
          onChange={(event) =>
            onChange({ ...draft, invitation_email: event.target.value })
          }
        />
      </label>
      <label className="onboarding-check wide">
        <input
          type="checkbox"
          checked={inviteAfterSave}
          onChange={(event) => onInviteChange(event.target.checked)}
        />
        <span>
          <Send size={16} aria-hidden /> Send invite after setup finishes
        </span>
      </label>
      {inviteAfterSave && draft.invitation_email.trim() ? (
        <p className="muted wide">
          Invite delivery waits until owner onboarding is completed.
        </p>
      ) : null}
    </>
  );
}

function SummaryList({
  icon,
  title,
  items,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <div className="onboarding-summary wide">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{items.join(", ")}</p>
      </div>
    </div>
  );
}

function Feedback({
  error,
  success,
}: {
  readonly error: string | null;
  readonly success: string | null;
}) {
  if (error)
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  if (success) return <p className="form-success">{success}</p>;
  return null;
}

function locationDraftIsComplete(draft: typeof defaultLocation): boolean {
  return [draft.name, draft.country_code, draft.timezone].every(
    (value) => value.trim().length > 0,
  );
}

async function loadOwnerReferences(workspaceId: string): Promise<{
  readonly locations: Location[];
  readonly departments: Department[];
  readonly jobs: Job[];
}> {
  const [locations, departments, jobs] = await Promise.all([
    listLocations(workspaceId),
    listDepartments(workspaceId),
    listJobs(workspaceId),
  ]);
  return { locations, departments, jobs };
}
