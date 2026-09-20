import {
  suggestLocationShortName,
  type Department,
  type EmployeeInput,
  type Job,
  type Location,
} from "@newfork/shared";
import {
  checkLocationDraft,
  formatUsPhone,
  type LocationDraft,
  type LocationFieldErrors,
} from "../settings/location-draft";
import { LocationTimezoneField } from "../settings/LocationTimezoneField";
import { ConfirmButton } from "@newfork/ui";
import {
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  MapPin,
  Send,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  AccountBlock,
  BusinessRow,
  Section,
  WizardBar,
} from "../shell/prebiz/PreBiz";
import { accountLandingPath } from "../auth/routeDestinations";
import { saveEmployee } from "../employees/employee-data";
import { employeeCreateReadiness } from "../employees/employee-create-flow";
import {
  listAccountWorkspaces,
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
  setDepartmentArchived,
  setJobArchived,
  setLocationArchived,
} from "../settings/organization-data";

type OwnerStep = 1 | 2 | 3 | 4;

const defaultLocation: LocationDraft = {
  name: "",
  short_name: "",
  phone: "",
  street_address: "",
  city: "",
  region: "",
  postal_code: "",
  country_code: "US",
  // The owner is almost always setting up the place they are standing in; an
  // empty zone made them scroll a 400-entry list for it.
  timezone: browserTimeZone(),
};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

const defaultEmployee: EmployeeInput = {
  first_name: "",
  last_name: "",
  preferred_name: "",
  invitation_email: "",
  start_date: "",
  internal_note: "",
  location_ids: [],
  primary_location_id: null,
  job_ids: [],
  primary_job_id: null,
  is_remote: false,
  is_excluded_from_schedule: false,
  expected_revision: null,
};

const departmentColor = "#3C7A68";
const jobColor = "#4478A8";

export default function OwnerOnboardingPage() {
  const { account, context, refresh, updateAccount } = useAuth();
  const accountWorkspaces = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
  });
  // With a single workspace the switcher would only lead back here.
  const canSwitchOrganization = (accountWorkspaces.data?.length ?? 0) > 1;
  const navigate = useNavigate();
  const [step, setStep] = useState<OwnerStep>(
    ownerStepFromContext(context?.onboarding.currentStep),
  );
  // How far the setup has actually got. Stepping back to re-read step 1 must not
  // make the panel claim nothing is done yet.
  const reached = Math.max(
    step,
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
  const [locationDraftEpoch, setLocationDraftEpoch] = useState(0);
  const [locationErrors, setLocationErrors] = useState<LocationFieldErrors>({});
  const [departmentName, setDepartmentName] = useState("");
  const [jobName, setJobName] = useState("");
  const [jobDepartmentId, setJobDepartmentId] = useState("");
  const [employeeDraft, setEmployeeDraft] = useState(defaultEmployee);
  const [addedTeam, setAddedTeam] = useState<readonly string[]>([]);
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
  // Same rule, same source as the in-app employee drawer: a name, and either an
  // assignment or one of the two exemptions.
  const teamDraftReady = employeeCreateReadiness(employeeDraft).employeeReady;

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

  const removeEntity = async (
    kind: "location" | "department" | "job",
    id: string,
  ): Promise<void> => {
    if (!workspaceId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await {
        location: setLocationArchived,
        department: setDepartmentArchived,
        job: setJobArchived,
      }[kind](workspaceId, id, true);
      await refreshOwnerReferences(workspaceId);
      setSuccess("Removed");
    } catch (removeError: unknown) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "It could not be removed",
      );
    } finally {
      setSubmitting(false);
    }
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
    const checked = checkLocationDraft(locationDraft);
    setLocationDraft({
      ...locationDraft,
      short_name: checked.input.short_name,
    });
    setLocationErrors(checked.errors);
    if (!checked.parsed.success) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await saveLocation(workspaceId, checked.parsed.data);
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 2,
        complete: false,
        expectedRevision: ownerOnboardingRevision,
      });
      await refreshOwnerReferences(workspaceId);
      setLocationDraft(defaultLocation);
      setLocationErrors({});
      setLocationDraftEpoch((value) => value + 1);
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
      const employeeId = await saveEmployee(workspaceId, employeeDraft);
      if (inviteAfterSave && employeeDraft.invitation_email.trim()) {
        await queueOwnerOnboardingInvitationIntent(supabaseClient, {
          workspaceId,
          employeeId,
          email: employeeDraft.invitation_email.trim(),
        });
      }
      setAddedTeam((current) => [
        ...current,
        `${employeeDraft.first_name.trim()} ${employeeDraft.last_name.trim()}`.trim(),
      ]);
      setEmployeeDraft(defaultEmployee);
      setSuccess(
        inviteAfterSave && employeeDraft.invitation_email.trim()
          ? "Added. The invitation goes out when setup finishes."
          : "Added",
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
    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      await resetOwnerOnboarding(supabaseClient, workspaceId);
      setStep(1);
      setLocationDraft(defaultLocation);
      setLocationErrors({});
      setLocationDraftEpoch((value) => value + 1);
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
    <div className="pb">
      <aside className="pb-side">
        <div className="pb-side-group">
          <span className="pb-brand">NEWFORK</span>
          <div className="pb-context">
            <strong title={workspaceName || undefined}>
              {workspaceName || "Your workspace"}
            </strong>
            <span>Workspace setup</span>
          </div>
          <div className="pb-progress">
            <div
              role="progressbar"
              aria-label="Steps done"
              aria-valuemin={0}
              aria-valuemax={ownerSteps.length}
              aria-valuenow={reached - 1}
            >
              <span
                style={{
                  width: `${((reached - 1) / ownerSteps.length) * 100}%`,
                }}
              />
            </div>
            <p>
              {reached - 1} of {ownerSteps.length} steps done
            </p>
          </div>
          <nav className="pb-steps" aria-label="Setup steps">
            {ownerSteps.map((label, index) => {
              const number = (index + 1) as OwnerStep;
              const done = number < reached;
              return (
                <button
                  key={label}
                  type="button"
                  className={`pb-step${number === step ? " is-active" : ""}${done ? " is-done" : ""}`}
                  aria-current={number === step ? "step" : undefined}
                  // Only backwards: moving forward is what each step's green
                  // button does, and that is what saves.
                  disabled={number > reached || submitting || resetting}
                  onClick={() => setStep(number)}
                >
                  <span className="pb-step-number" aria-hidden>
                    {done ? <Check size={13} /> : number}
                  </span>
                  <span className="pb-step-label">
                    {label}
                    {done ? <span className="sr-only">, done</span> : null}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="pb-side-group">
          {canSwitchOrganization ? (
            <button
              type="button"
              className="pb-btn pb-btn-secondary"
              onClick={() => navigate("/organization-switcher")}
            >
              <Building2 size={15} aria-hidden /> Switch workspace
            </button>
          ) : null}
          {/* Leaves the wizard, not the account: the draft stays on the landing. */}
          <button
            type="button"
            className="pb-btn pb-btn-secondary"
            onClick={() => navigate(accountLandingPath)}
          >
            Exit setup
          </button>
          <ConfirmButton
            className="pb-btn pb-btn-danger"
            type="button"
            disabled={submitting || resetting}
            confirmLabel="Click again to start over"
            onConfirm={() => void startOver()}
          >
            {resetting ? "Resetting" : "Start over"}
          </ConfirmButton>
          <AccountBlock />
        </div>
      </aside>
      <main className="pb-stage pb-stage-wide">
        {loading ? (
          <section className="onboarding-content">
            <p role="status">Loading your setup…</p>
          </section>
        ) : null}

        {!loading && step === 1 ? (
          <section
            className="onboarding-content"
            aria-labelledby="workspace-identity-title"
          >
            <header className="onboarding-step-heading">
              <h1 id="workspace-identity-title">Name your workspace</h1>
              <div>This is the name your team sees when they sign in.</div>
            </header>
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
              <Feedback success={success} />
              <WizardBar error={error}>
                <button
                  type="submit"
                  className="pb-btn pb-btn-primary"
                  disabled={
                    submitting ||
                    workspaceName.trim().length === 0 ||
                    ownerFullName.trim().length === 0
                  }
                >
                  Continue <ChevronRight size={16} aria-hidden />
                </button>
              </WizardBar>
            </form>
          </section>
        ) : null}

        {!loading && step === 2 ? (
          <section
            className="onboarding-content"
            aria-labelledby="locations-title"
          >
            <header className="onboarding-step-heading">
              <h1 id="locations-title">Where does your team work?</h1>
              <div>
                One location is one place with its own schedule. Add more now or
                later.
              </div>
            </header>
            <form className="onboarding-form" onSubmit={saveLocationStep}>
              <div className="owner-onboarding-grid">
                <AddedList
                  title="Locations added"
                  items={activeLocations}
                  disabled={submitting}
                  onRemove={(id) => void removeEntity("location", id)}
                />
                <LocationFields
                  key={locationDraftEpoch}
                  draft={locationDraft}
                  errors={locationErrors}
                  onChange={(draft, field) => {
                    setLocationDraft(draft);
                    if (field)
                      setLocationErrors((current) => ({
                        ...current,
                        [field]: undefined,
                      }));
                  }}
                />
              </div>
              <Feedback success={success} />
              <WizardBar
                back={{ label: "Workspace", onClick: () => setStep(1) }}
                error={error}
              >
                <button
                  className="pb-btn pb-btn-secondary"
                  type="submit"
                  disabled={
                    submitting || !checkLocationDraft(locationDraft).complete
                  }
                >
                  <MapPin size={15} aria-hidden /> Add location
                </button>
                <button
                  type="button"
                  className="pb-btn pb-btn-primary"
                  disabled={submitting || activeLocations.length === 0}
                  onClick={continueFromLocations}
                >
                  Continue <ChevronRight size={16} aria-hidden />
                </button>
              </WizardBar>
            </form>
          </section>
        ) : null}

        {!loading && step === 3 ? (
          <section
            className="onboarding-content"
            aria-labelledby="departments-jobs-title"
          >
            <header className="onboarding-step-heading">
              <h1 id="departments-jobs-title">What jobs do people work?</h1>
              <div>
                A job is what someone is scheduled as. A department groups jobs
                that work together.
              </div>
            </header>
            <form className="onboarding-form" onSubmit={saveDepartmentAndJob}>
              <div className="owner-onboarding-grid">
                <AddedList
                  title="Departments added"
                  items={activeDepartments}
                  disabled={submitting}
                  onRemove={(id) => void removeEntity("department", id)}
                />
                {activeDepartments.length > 0 ? (
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
                      {/* The wizard used to drop this field after the first
                          department, so a second one could not be created. */}
                      <option value="">Add a new department</option>
                    </select>
                  </label>
                ) : null}
                {jobDepartmentId === "" ? (
                  <label className="wide" htmlFor="department-name">
                    New department
                    <input
                      id="department-name"
                      value={departmentName}
                      maxLength={100}
                      onChange={(event) =>
                        setDepartmentName(event.target.value)
                      }
                      placeholder="Front of house"
                      required
                    />
                  </label>
                ) : null}
                <AddedList
                  title="Jobs added"
                  items={activeJobs}
                  disabled={submitting}
                  onRemove={(id) => void removeEntity("job", id)}
                />
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
              <Feedback success={success} />
              <WizardBar
                back={{ label: "Locations", onClick: () => setStep(2) }}
                error={error}
              >
                <button
                  className="pb-btn pb-btn-secondary"
                  type="submit"
                  disabled={
                    submitting ||
                    jobName.trim().length === 0 ||
                    (jobDepartmentId === "" &&
                      departmentName.trim().length === 0)
                  }
                >
                  <BriefcaseBusiness size={15} aria-hidden /> Add job
                </button>
                <button
                  type="button"
                  className="pb-btn pb-btn-primary"
                  disabled={
                    submitting ||
                    activeDepartments.length === 0 ||
                    activeJobs.length === 0
                  }
                  onClick={continueFromStructure}
                >
                  Continue <ChevronRight size={16} aria-hidden />
                </button>
              </WizardBar>
            </form>
          </section>
        ) : null}

        {!loading && step === 4 ? (
          <section className="onboarding-content" aria-labelledby="team-title">
            <header className="onboarding-step-heading">
              <h1 id="team-title">Add your team</h1>
              <div>
                Optional. You can add everyone later from the Employees page.
              </div>
            </header>
            {addedTeam.length > 0 ? (
              <Section title="Added so far">
                {addedTeam.map((name, index) => (
                  <BusinessRow key={`${name}-${index}`} name={name}>
                    <span />
                  </BusinessRow>
                ))}
              </Section>
            ) : null}
            <form className="onboarding-form" onSubmit={saveTeamMember}>
              <div className="owner-onboarding-grid">
                <EmployeeFields
                  draft={employeeDraft}
                  inviteAfterSave={inviteAfterSave}
                  onChange={setEmployeeDraft}
                  onInviteChange={setInviteAfterSave}
                />
                <AssignmentChecks
                  legend="Locations"
                  options={activeLocations}
                  selected={employeeDraft.location_ids}
                  required={!exemptFromSchedule(employeeDraft)}
                  onChange={(ids) =>
                    setEmployeeDraft({
                      ...employeeDraft,
                      location_ids: ids,
                      primary_location_id: ids[0] ?? null,
                    })
                  }
                />
                <AssignmentChecks
                  legend="Jobs"
                  options={activeJobs}
                  selected={employeeDraft.job_ids}
                  required={!exemptFromSchedule(employeeDraft)}
                  onChange={(ids) =>
                    setEmployeeDraft({
                      ...employeeDraft,
                      job_ids: ids,
                      primary_job_id: ids[0] ?? null,
                    })
                  }
                />
              </div>
              <Feedback success={success} />
              <WizardBar
                back={{ label: "Jobs", onClick: () => setStep(3) }}
                error={error}
              >
                <ConfirmButton
                  className="pb-btn pb-btn-danger"
                  type="button"
                  disabled={submitting || !employeeDraftHasInput(employeeDraft)}
                  confirmLabel="Click again to clear"
                  onConfirm={() => {
                    setEmployeeDraft(defaultEmployee);
                    setSuccess("Draft cleared");
                    setError(null);
                  }}
                >
                  Clear draft
                </ConfirmButton>
                <button
                  className="pb-btn pb-btn-secondary"
                  type="submit"
                  disabled={submitting || !teamDraftReady}
                >
                  <Users size={15} aria-hidden /> Add employee
                </button>
                <button
                  type="button"
                  className="pb-btn pb-btn-primary"
                  disabled={submitting}
                  onClick={completeSetup}
                >
                  {submitting ? "Finishing" : "Finish setup"}{" "}
                  <ChevronRight size={16} aria-hidden />
                </button>
              </WizardBar>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  );
}

const ownerSteps = ["Workspace", "Locations", "Jobs", "Team"] as const;

function ownerStepFromContext(currentStep: number | undefined): OwnerStep {
  return currentStep === 4
    ? 4
    : currentStep === 3
      ? 3
      : currentStep === 2
        ? 2
        : 1;
}

function employeeDraftHasInput(draft: EmployeeInput): boolean {
  return (
    [
      draft.first_name,
      draft.last_name,
      draft.invitation_email,
      draft.start_date,
      draft.internal_note,
    ].some((value) => value.trim().length > 0) ||
    draft.location_ids.length > 0 ||
    draft.job_ids.length > 0 ||
    Boolean(draft.is_remote) ||
    Boolean(draft.is_excluded_from_schedule)
  );
}

function LocationFields({
  draft,
  errors,
  onChange,
}: {
  readonly draft: LocationDraft;
  readonly errors: LocationFieldErrors;
  readonly onChange: (
    draft: LocationDraft,
    field?: keyof LocationFieldErrors,
  ) => void;
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
      <label htmlFor="location-short-name">
        Short name
        <input
          id="location-short-name"
          value={draft.short_name}
          maxLength={12}
          onChange={(event) =>
            onChange(
              { ...draft, short_name: event.target.value.toUpperCase() },
              "short_name",
            )
          }
          placeholder={suggestLocationShortName(draft.name)}
          aria-invalid={errors.short_name ? true : undefined}
          aria-describedby={
            errors.short_name ? "location-short-name-error" : undefined
          }
          aria-required
        />
        {errors.short_name ? (
          <small
            className="form-error"
            id="location-short-name-error"
            role="alert"
          >
            {errors.short_name}
          </small>
        ) : null}
      </label>
      <label htmlFor="location-phone">
        Phone number (optional)
        <input
          id="location-phone"
          type="tel"
          inputMode="numeric"
          value={draft.phone}
          maxLength={14}
          onChange={(event) =>
            onChange(
              { ...draft, phone: formatUsPhone(event.target.value) },
              "phone",
            )
          }
          placeholder="(415) 555-0100"
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? "location-phone-error" : undefined}
        />
        {errors.phone ? (
          <small className="form-error" id="location-phone-error" role="alert">
            {errors.phone}
          </small>
        ) : null}
      </label>
      <label htmlFor="location-timezone">
        Timezone
        <LocationTimezoneField
          id="location-timezone"
          country={draft.country_code}
          postal={draft.postal_code}
          value={draft.timezone}
          onChange={(timezone) => onChange({ ...draft, timezone })}
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

function exemptFromSchedule(draft: EmployeeInput): boolean {
  return Boolean(draft.is_remote || draft.is_excluded_from_schedule);
}

/**
 * Pick the locations or jobs this person works. Required unless they are remote
 * or kept off the schedule — the same rule the employee drawer enforces. The
 * first one picked is the primary; the wizard does not ask, Settings can change it.
 */
function AssignmentChecks({
  legend,
  options,
  selected,
  required,
  onChange,
}: {
  readonly legend: string;
  readonly options: readonly { readonly id: string; readonly name: string }[];
  readonly selected: readonly string[];
  readonly required: boolean;
  readonly onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="owner-assignment-checks wide">
      <legend>
        {legend}
        {required ? <span> · required</span> : null}
      </legend>
      {options.map((option) => (
        <label key={option.id}>
          <input
            type="checkbox"
            checked={selected.includes(option.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, option.id]
                  : selected.filter((id) => id !== option.id),
              )
            }
          />
          <span>{option.name}</span>
        </label>
      ))}
    </fieldset>
  );
}

function EmployeeFields({
  draft,
  inviteAfterSave,
  onChange,
  onInviteChange,
}: {
  readonly draft: EmployeeInput;
  readonly inviteAfterSave: boolean;
  readonly onChange: (draft: EmployeeInput) => void;
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
          checked={draft.is_remote ?? false}
          onChange={(event) =>
            onChange({ ...draft, is_remote: event.target.checked })
          }
        />
        <span>Works remotely</span>
      </label>
      <label className="onboarding-check wide">
        <input
          type="checkbox"
          checked={draft.is_excluded_from_schedule ?? false}
          onChange={(event) =>
            onChange({
              ...draft,
              is_excluded_from_schedule: event.target.checked,
            })
          }
        />
        <span>Not on the schedule</span>
      </label>
      <label className="onboarding-check wide">
        <input
          type="checkbox"
          checked={inviteAfterSave}
          onChange={(event) => onInviteChange(event.target.checked)}
        />
        <span>
          <Send size={16} aria-hidden /> Send the invitation when setup finishes
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

/** What the owner has added so far, and the way to take one back off. */
function AddedList({
  title,
  items,
  disabled,
  onRemove,
}: {
  readonly title: string;
  readonly items: readonly { readonly id: string; readonly name: string }[];
  readonly disabled: boolean;
  readonly onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="wide">
      <Section title={title}>
        {items.map((item) => (
          <BusinessRow key={item.id} name={item.name}>
            <ConfirmButton
              className="pb-btn pb-btn-danger"
              type="button"
              disabled={disabled}
              aria-label={"Remove " + item.name}
              confirmLabel="Click again to remove"
              onConfirm={() => onRemove(item.id)}
            >
              Remove
            </ConfirmButton>
          </BusinessRow>
        ))}
      </Section>
    </div>
  );
}

/** The bar carries the error; this is only the "saved" line next to the form. */
function Feedback({ success }: { readonly success: string | null }) {
  return success ? <p className="form-success">{success}</p> : null;
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
