import {
  managementJobIds,
  suggestLocationShortName,
  type Department,
  type EmployeeInput,
  type Job,
  type Location,
} from "@newfork/shared";
import {
  checkLocationDraft,
  locationDraft as locationDraftOf,
  type LocationDraft,
  type LocationFieldErrors,
} from "../settings/location-draft";
import { LocationTimezoneField } from "../settings/LocationTimezoneField";
import { UsPhoneInput } from "../shell/UsPhoneInput";
import { breaksLetterRule, LetterRuleNote, letterRuleProps } from "../shell/us-text";
import { ConfirmButton } from "@newfork/ui";
import {
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  MapPin,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  AccountBlock,
  BusinessRow,
  Section,
  WizardBar,
} from "../shell/prebiz/PreBiz";
import { hubPath } from "../auth/resolveLanding";
import { saveEmployee } from "../employees/employee-data";
import { ownerJobReason } from "../employees/EmployeeLocationParts";
import {
  employeeCreateReadiness,
  firstJobExceptOwner,
} from "../employees/employee-create-flow";
import {
  listAccountWorkspaces,
  queueOwnerOnboardingInvitationIntent,
  resetOwnerOnboarding,
  saveOwnerOnboarding,
  supabaseClient,
} from "../lib/supabase";
import { RequestError } from "../lib/request-error";
import {
  listDepartments,
  loadDepartmentsAndJobs,
  listLocations,
  saveDepartment,
  saveJob,
  saveLocation,
  setDepartmentArchived,
  setJobArchived,
  setLocationArchived,
} from "../settings/organization-data";
import { FieldNote, fieldNoteId } from "../shell/FieldNote";
import { membershipClass } from "../auth/access";

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
  // Two parts, because two parts are what an employee record holds. Asking
  // for one "full name" meant guessing where the family name started.
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerMiddleName, setOwnerMiddleName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [locationDraft, setLocationDraft] = useState(defaultLocation);
  const [locationDraftEpoch, setLocationDraftEpoch] = useState(0);
  const [locationErrors, setLocationErrors] = useState<LocationFieldErrors>({});
  // Editing a location fills the same form the next one is typed into.
  // Nine fields is too many to retype because a name has a typo in it.
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState("");
  const [jobName, setJobName] = useState("");
  const [jobDepartmentId, setJobDepartmentId] = useState("");
  // Adding a department is its own act, not a mode hidden inside the job
  // selector. With nothing added yet there is nothing to choose from, so the
  // department field is what the form opens with.
  const [addingDepartment, setAddingDepartment] = useState(false);
  const [renamingDepartmentId, setRenamingDepartmentId] = useState<
    string | null
  >(null);
  const [renameDepartmentName, setRenameDepartmentName] = useState("");
  // A job chip opens in place. Moving one is the reason it opens at all.
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [jobPanelName, setJobPanelName] = useState("");
  const [jobPanelDepartmentId, setJobPanelDepartmentId] = useState("");
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

  // BL-1046: the setup moved on in another tab or window. Read it again and
  // say so; the next save goes on the latest revision.
  const setupFailed = async (cause: unknown, fallback: string): Promise<void> => {
    if (
      cause instanceof RequestError &&
      cause.status === 409 &&
      cause.reason === "workspace.onboarding_changed"
    ) {
      await refresh();
      setError(
        "Your setup changed in another tab or window. You're seeing the latest version; check it and save again.",
      );
      return;
    }
    setError(cause instanceof Error ? cause.message : fallback);
  };


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
  // Management and its jobs come with the workspace and do not count towards
  // finishing setup (EMP-001 K2); the server counts the same way.
  const management = activeDepartments.find(
    (department) => department.system_key === "management",
  );
  const managementIds = managementJobIds(departments, jobs);
  const ownDepartmentCount = activeDepartments.length - (management ? 1 : 0);
  const structureReady =
    ownDepartmentCount > 0 &&
    activeJobs.some((job) => !managementIds.has(job.id));
  // Saving bumps locationDraftEpoch, which remounts the fields and drops focus
  // on the body. The next location starts where the last one did.
  useEffect(() => {
    if (step !== 2 || locationDraftEpoch === 0) return;
    document.getElementById("location-name")?.focus();
  }, [step, locationDraftEpoch]);

  const jobsIn = (departmentId: string): Job[] =>
    activeJobs.filter((job) => job.department_id === departmentId);
  // Nothing here makes one, but older data can carry a job whose department is
  // gone. It stays in view rather than disappearing out of the structure.
  const looseJobs = useMemo(
    () =>
      activeJobs.filter(
        (job) =>
          !job.department_id ||
          !departments.some(
            (department) =>
              department.id === job.department_id && !department.archived_at,
          ),
      ),
    [activeJobs, departments],
  );
  const creatingDepartment = addingDepartment || ownDepartmentCount === 0;
  const editingLocationName =
    activeLocations.find((location) => location.id === editingLocationId)?.name ??
    null;
  // Same rule, same source as the in-app employee drawer: a name, and either an
  // assignment or one of the two exemptions.
  const teamDraftReady = employeeCreateReadiness(employeeDraft).employeeReady;

  if (!context) return null;
  if (
    membershipClass(context.membership) !== "owner" ||
    context.onboarding.status === "complete"
  ) {
    return <Navigate to="/app" replace />;
  }

  const refreshOwnerReferences = async (
    id: string,
    preferDepartmentId?: string,
  ): Promise<void> => {
    const references = await loadOwnerReferences(id);
    setLocations(references.locations);
    setDepartments(references.departments);
    setJobs(references.jobs);
    const open = references.departments.filter(
      (department) => !department.archived_at,
    );
    // Staying put is the whole point. This used to snap back to the first
    // department after every save, so a job typed straight after adding a
    // second one landed silently in the first.
    setJobDepartmentId((current) => {
      if (preferDepartmentId && open.some((one) => one.id === preferDepartmentId))
        return preferDepartmentId;
      if (current && open.some((one) => one.id === current)) return current;
      return open[0]?.id ?? "";
    });
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
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const first = ownerFirstName.trim();
      const last = ownerLastName.trim();
      // The account's name and the workspace's record of the person are set
      // from the same two answers, so they cannot disagree on arrival.
      // Teammates see the given and family name; a middle name belongs on the
      // record, not in every list.
      await updateAccount(`${first} ${last}`, account.theme, account.phone);
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 2,
        complete: false,
        expectedRevision: ownerOnboardingRevision,
        ownerFirstName: first,
        ownerMiddleName: ownerMiddleName.trim(),
        ownerLastName: last,
      });
      setStep(2);
      await refresh();
    } catch (saveError: unknown) {
      await setupFailed(saveError, "Workspace setup could not be saved");
    } finally {
      setSubmitting(false);
    }
  };

  const editLocation = (location: Location): void => {
    setEditingLocationId(location.id);
    setLocationDraft(locationDraftOf(location));
    setLocationErrors({});
    setLocationDraftEpoch((value) => value + 1);
    setSuccess(null);
  };

  const stopEditingLocation = (): void => {
    setEditingLocationId(null);
    setLocationDraft(defaultLocation);
    setLocationErrors({});
    setLocationDraftEpoch((value) => value + 1);
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
    // The database has a unique index on it, so without this the second "Main"
    // came back as a constraint violation with nowhere to read it.
    const takenBy = activeLocations.find(
      (location) =>
        location.id !== editingLocationId &&
        location.short_name.toLowerCase() ===
          checked.input.short_name.toLowerCase(),
    );
    if (takenBy) {
      setLocationErrors({
        ...checked.errors,
        short_name: `${takenBy.name} already goes by that short name.`,
      });
      return;
    }
    setLocationErrors(checked.errors);
    if (!checked.parsed.success) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await saveLocation(
        workspaceId,
        checked.parsed.data,
        editingLocationId ?? undefined,
      );
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 2,
        complete: false,
        expectedRevision: ownerOnboardingRevision,
      });
      await refreshOwnerReferences(workspaceId);
      const wasEditing = editingLocationId !== null;
      setEditingLocationId(null);
      setLocationDraft(defaultLocation);
      setLocationErrors({});
      setLocationDraftEpoch((value) => value + 1);
      setSuccess(wasEditing ? "Location updated" : "Location added");
      await refresh();
    } catch (saveError: unknown) {
      await setupFailed(saveError, "The location could not be saved");
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
      await setupFailed(saveError, "Location setup could not be continued");
    } finally {
      setSubmitting(false);
    }
  };

  const addDepartment = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!workspaceId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await saveDepartment(workspaceId, {
        name: departmentName,
        color: departmentColor,
      });
      const named = departmentName.trim().toLowerCase();
      const saved = await listDepartments(workspaceId);
      // The new one is where the next job should go, not the first one.
      const created = saved.find(
        (department) =>
          !department.archived_at && department.name.toLowerCase() === named,
      );
      await refreshOwnerReferences(workspaceId, created?.id);
      setDepartmentName("");
      setAddingDepartment(false);
      setSuccess("Department added");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The department could not be saved",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const addJob = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!supabaseClient || !workspaceId || !jobDepartmentId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await saveJob(workspaceId, {
        name: jobName,
        color: jobColor,
        department_id: jobDepartmentId,
      });
      await saveOwnerOnboarding(supabaseClient, {
        workspaceId,
        workspaceName,
        nextStep: 3,
        complete: false,
        expectedRevision: ownerOnboardingRevision,
      });
      await refreshOwnerReferences(workspaceId, jobDepartmentId);
      setJobName("");
      setSuccess("Job added");
      await refresh();
    } catch (saveError: unknown) {
      await setupFailed(saveError, "The job could not be saved");
    } finally {
      setSubmitting(false);
    }
  };

  const renameDepartment = async (department: Department): Promise<void> => {
    if (
      !workspaceId ||
      renameDepartmentName.trim().length === 0 ||
      breaksLetterRule(renameDepartmentName)
    )
      return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await saveDepartment(
        workspaceId,
        { name: renameDepartmentName, color: department.color },
        department.id,
      );
      await refreshOwnerReferences(workspaceId, department.id);
      setRenamingDepartmentId(null);
      setSuccess("Renamed");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The department could not be renamed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // A department leaves with its jobs. A job with no department is a half-built
  // structure to walk out of setup with, and nothing here asks for one.
  const removeDepartment = async (department: Department): Promise<void> => {
    if (!workspaceId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      for (const job of activeJobs.filter(
        (candidate) => candidate.department_id === department.id,
      ))
        await setJobArchived(workspaceId, job.id, true);
      await setDepartmentArchived(workspaceId, department.id, true);
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

  const saveOpenJob = async (job: Job): Promise<void> => {
    if (!workspaceId || jobPanelName.trim().length === 0 || breaksLetterRule(jobPanelName)) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await saveJob(
        workspaceId,
        {
          name: jobPanelName,
          color: job.color,
          department_id: jobPanelDepartmentId || null,
        },
        job.id,
      );
      await refreshOwnerReferences(workspaceId);
      setOpenJobId(null);
      setSuccess("Job saved");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The job could not be saved",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openJobChip = (job: Job): void => {
    setOpenJobId(job.id);
    setJobPanelName(job.name);
    setJobPanelDepartmentId(job.department_id ?? "");
  };

  // A selector inside a list is right when it belongs to the row and wrong when
  // it belongs to the form. This one belongs to the job it sits under.
  const jobPanel = (group: readonly Job[]) => {
    const job = group.find((candidate) => candidate.id === openJobId);
    if (!job) return null;
    return (
      <div className="ob-job-panel">
        <label htmlFor="job-panel-name">
          Job name
          <input
            id="job-panel-name"
            // Named outright: the rule's line sits inside the label.
            aria-label="Job name"
            value={jobPanelName}
            maxLength={100}
            onChange={(event) => setJobPanelName(event.target.value)}
            {...letterRuleProps(jobPanelName, "job-panel-name")}
          />
          <LetterRuleNote value={jobPanelName} id="job-panel-name" />
        </label>
        <label htmlFor="job-panel-department">
          Department
          <select
            id="job-panel-department"
            value={jobPanelDepartmentId}
            onChange={(event) => setJobPanelDepartmentId(event.target.value)}
          >
            {activeDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
            {jobPanelDepartmentId === "" ? (
              <option value="">No department</option>
            ) : null}
          </select>
        </label>
        <div className="ob-job-panel-actions">
          <button
            type="button"
            className="pb-btn pb-btn-primary"
            disabled={submitting || jobPanelName.trim().length === 0 || breaksLetterRule(jobPanelName)}
            onClick={() => void saveOpenJob(job)}
          >
            Save
          </button>
          <ConfirmButton
            className="pb-btn pb-btn-danger"
            type="button"
            disabled={submitting}
            aria-label={"Remove " + job.name}
            confirmLabel="Confirm remove"
            onConfirm={() => void removeEntity("job", job.id)}
          >
            Remove
          </ConfirmButton>
          <button
            type="button"
            className="pb-btn pb-btn-secondary"
            disabled={submitting}
            onClick={() => setOpenJobId(null)}
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  const continueFromStructure = async (): Promise<void> => {
    if (!supabaseClient || !workspaceId || !structureReady) return;
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
      await setupFailed(saveError, "Team structure setup could not be continued");
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
      // Same rule as the Employees drawer (EMP-001 S2): the first job ticked
      // is the primary, a Management job too, and never the Owner job.
      const employeeId = await saveEmployee(workspaceId, {
        ...employeeDraft,
        primary_job_id: firstJobExceptOwner(
          employeeDraft.job_ids,
          jobs.find((job) => job.system_key === "owner")?.id,
        ),
      });
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
    if (!structureReady) {
      setStep(3);
      setError(
        `Add at least one active department and job${management ? ` outside ${management.name}` : ""} before finishing setup`,
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
      await setupFailed(saveError, "Setup could not be completed");
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
              onClick={() => navigate(hubPath)}
            >
              <Building2 size={15} aria-hidden /> Switch workspace
            </button>
          ) : null}
          {/* Leaves the wizard, not the account: the draft stays on the landing. */}
          <button
            type="button"
            className="pb-btn pb-btn-secondary"
            onClick={() => navigate(hubPath)}
          >
            Exit setup
          </button>
          <ConfirmButton
            className="pb-btn pb-btn-danger"
            type="button"
            disabled={submitting || resetting}
            confirmLabel="Confirm start over"
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
                {/* The owner's legal name: saved as the account name and as the
                    name documents read. Going by another name is Profile's job. */}
                <fieldset
                  className="ob-fieldset owner-name-row wide"
                  aria-describedby="owner-name-help"
                >
                  <legend>Name as it appears on your ID</legend>
                  <label htmlFor="owner-first-name">
                    First name
                    <input
                      id="owner-first-name"
                      // Named outright: the rule's line sits inside the label.
                      aria-label="First name"
                      value={ownerFirstName}
                      maxLength={80}
                      onChange={(event) => setOwnerFirstName(event.target.value)}
                      autoComplete="given-name"
                      autoFocus
                      required
                      {...letterRuleProps(ownerFirstName, "owner-first-name")}
                    />
                    <LetterRuleNote value={ownerFirstName} id="owner-first-name" />
                  </label>
                  <label htmlFor="owner-middle-name">
                    Middle name <span className="field-optional">optional</span>
                    <input
                      id="owner-middle-name"
                      // Named outright: the rule's line sits inside the label.
                      aria-label="Middle name"
                      value={ownerMiddleName}
                      maxLength={80}
                      onChange={(event) => setOwnerMiddleName(event.target.value)}
                      autoComplete="additional-name"
                      {...letterRuleProps(ownerMiddleName, "owner-middle-name")}
                    />
                    <LetterRuleNote value={ownerMiddleName} id="owner-middle-name" />
                  </label>
                  <label htmlFor="owner-last-name">
                    Last name
                    <input
                      id="owner-last-name"
                      // Named outright: the rule's line sits inside the label.
                      aria-label="Last name"
                      value={ownerLastName}
                      maxLength={80}
                      onChange={(event) => setOwnerLastName(event.target.value)}
                      autoComplete="family-name"
                      required
                      {...letterRuleProps(ownerLastName, "owner-last-name")}
                    />
                    <LetterRuleNote value={ownerLastName} id="owner-last-name" />
                  </label>
                  <small id="owner-name-help" className="field-help">
                    Documents and signatures use this name. Go by something
                    else? Add a preferred name later in Account › Profile.
                  </small>
                </fieldset>
                <label className="wide" htmlFor="workspace-name">
                  Workspace name
                  <input
                    id="workspace-name"
                    // Named outright: the rule's line sits inside the label.
                    aria-label="Workspace name"
                    value={workspaceName}
                    maxLength={120}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    required
                    {...letterRuleProps(workspaceName, "workspace-name")}
                  />
                  <LetterRuleNote value={workspaceName} id="workspace-name" />
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
                    ownerFirstName.trim().length === 0 ||
                    ownerLastName.trim().length === 0 ||
                    breaksLetterRule(workspaceName, ownerFirstName, ownerMiddleName, ownerLastName)
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

            {/* The list is its own block. It used to sit inside the form, above
                the fields it was the output of. */}
            <div className="pb-section">
              <div className="ob-section-head">
                <h2 id="locations-list-title">Your locations</h2>
                <span className="pb-badge pb-badge-success">
                  {countLabel(activeLocations.length, "location")}
                </span>
              </div>
              <div
                className="pb-list"
                role="list"
                aria-labelledby="locations-list-title"
              >
                {activeLocations.length === 0 ? (
                  <p className="ob-empty">
                    No locations yet. Add the first one below.
                  </p>
                ) : null}
                {activeLocations.map((location) => (
                  <BusinessRow
                    key={location.id}
                    name={location.name}
                    badge={
                      <>
                        {/* Two places called "Main" are told apart by these,
                            not by the name the row leads with. */}
                        <span className="pb-badge">{location.short_name}</span>
                        {location.city ? (
                          <span>
                            {[location.city, location.region]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        ) : null}
                        <span>{location.timezone}</span>
                      </>
                    }
                  >
                    <button
                      type="button"
                      className="pb-btn pb-btn-secondary"
                      disabled={submitting}
                      aria-label={"Edit " + location.name}
                      onClick={() => editLocation(location)}
                    >
                      Edit
                    </button>
                    <ConfirmButton
                      className="pb-btn pb-btn-danger"
                      type="button"
                      disabled={submitting}
                      aria-label={"Remove " + location.name}
                      confirmLabel="Confirm remove"
                      onConfirm={() => void removeEntity("location", location.id)}
                    >
                      Remove
                    </ConfirmButton>
                  </BusinessRow>
                ))}
              </div>
            </div>

            <form className="onboarding-form" onSubmit={saveLocationStep}>
              <div className="ob-form-head">
                <h2>
                  {editingLocationId
                    ? "Edit " + (editingLocationName ?? "this location")
                    : "Add a location"}
                </h2>
                <p>
                  A location is a place with its own schedule. The short name is
                  what the schedule has room for.
                </p>
              </div>
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
              <Feedback success={success} />
              <WizardBar
                back={{ label: "Workspace", onClick: () => setStep(1) }}
                error={error}
              >
                {editingLocationId ? (
                  <button
                    type="button"
                    className="pb-btn pb-btn-secondary"
                    disabled={submitting}
                    onClick={stopEditingLocation}
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  className="pb-btn pb-btn-secondary"
                  type="submit"
                  disabled={
                    submitting || !checkLocationDraft(locationDraft).complete
                  }
                >
                  <MapPin size={15} aria-hidden />{" "}
                  {editingLocationId ? "Save changes" : "Add location"}
                </button>
                <button
                  type="button"
                  className="pb-btn pb-btn-primary"
                  disabled={
                    submitting ||
                    activeLocations.length === 0 ||
                    editingLocationId !== null
                  }
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

            {/* The list is one block and the form is another. What has been
                built shows as a structure, because that is what it is. */}
            <div className="pb-section">
              <div className="ob-section-head">
                <h2 id="structure-list-title">Your structure</h2>
                <span className="pb-badge pb-badge-success">
                  {countLabel(activeDepartments.length, "department")}
                  {" \u00b7 "}
                  {countLabel(activeJobs.length, "job")}
                </span>
              </div>
              <div
                className="pb-list"
                role="list"
                aria-labelledby="structure-list-title"
              >
                {activeDepartments.length === 0 && looseJobs.length === 0 ? (
                  <p className="ob-empty">
                    No departments yet. Add the first one below.
                  </p>
                ) : null}
                {activeDepartments.map((department) => (
                  <div
                    className="ob-dept-row"
                    role="listitem"
                    key={department.id}
                  >
                    <div className="ob-dept-head">
                      {renamingDepartmentId === department.id ? (
                        <input
                          className="ob-rename"
                          aria-label={"Rename " + department.name}
                          value={renameDepartmentName}
                          maxLength={100}
                          onChange={(event) =>
                            setRenameDepartmentName(event.target.value)
                          }
                          {...letterRuleProps(renameDepartmentName, "rename-department")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void renameDepartment(department);
                            }
                            if (event.key === "Escape")
                              setRenamingDepartmentId(null);
                          }}
                        />
                      ) : (
                        <strong>{department.name}</strong>
                      )}
                      <span className="pb-badge">
                        {countLabel(jobsIn(department.id).length, "job")}
                      </span>
                      <div className="pb-row-actions">
                        {renamingDepartmentId === department.id ? (
                          <>
                            <button
                              type="button"
                              className="pb-btn pb-btn-secondary"
                              disabled={
                                submitting ||
                                renameDepartmentName.trim().length === 0 ||
                                breaksLetterRule(renameDepartmentName)
                              }
                              onClick={() => void renameDepartment(department)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="pb-btn pb-btn-secondary"
                              disabled={submitting}
                              onClick={() => setRenamingDepartmentId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="pb-btn pb-btn-secondary"
                              disabled={submitting}
                              onClick={() => {
                                setRenamingDepartmentId(department.id);
                                setRenameDepartmentName(department.name);
                              }}
                            >
                              Rename
                            </button>
                            {/* Its jobs go with it, and the second click says
                                how many. */}
                            <ConfirmButton
                              className="pb-btn pb-btn-danger"
                              type="button"
                              disabled={submitting}
                              aria-label={"Remove " + department.name}
                              confirmLabel={
                                jobsIn(department.id).length === 0
                                  ? "Confirm remove"
                                  : "Confirm remove, takes " +
                                    countLabel(
                                      jobsIn(department.id).length,
                                      "job",
                                    ) +
                                    " with it"
                              }
                              onConfirm={() =>
                                void removeDepartment(department)
                              }
                            >
                              Remove
                            </ConfirmButton>
                          </>
                        )}
                      </div>
                    </div>
                    {renamingDepartmentId === department.id ? (
                      <LetterRuleNote value={renameDepartmentName} id="rename-department" />
                    ) : null}
                    <JobChips
                      jobs={jobsIn(department.id)}
                      empty="No jobs in this department yet."
                      openJobId={openJobId}
                      disabled={submitting}
                      onOpen={openJobChip}
                    />
                    {jobPanel(jobsIn(department.id))}
                  </div>
                ))}
                {looseJobs.length > 0 ? (
                  <div className="ob-dept-row" role="listitem">
                    <div className="ob-dept-head">
                      <strong>No department</strong>
                      <span className="pb-badge pb-badge-progress">
                        {countLabel(looseJobs.length, "job")}
                      </span>
                    </div>
                    <JobChips
                      jobs={looseJobs}
                      empty=""
                      openJobId={openJobId}
                      disabled={submitting}
                      onOpen={openJobChip}
                    />
                    {jobPanel(looseJobs)}
                  </div>
                ) : null}
                {/* Management alone does not finish the step (EMP-001 K2):
                    the list says what is missing (BL-480). */}
                {management && ownDepartmentCount === 0 ? (
                  <p className="ob-empty">
                    {management.name} comes with every workspace. Add a
                    department for the jobs your team works.
                  </p>
                ) : null}
              </div>
            </div>

            <form
              className="onboarding-form"
              onSubmit={creatingDepartment ? addDepartment : addJob}
            >
              <div className="ob-form-head">
                <h2>{creatingDepartment ? "Add a department" : "Add a job"}</h2>
                <p>
                  {creatingDepartment
                    ? "A department groups the jobs that work together."
                    : "The department sits beside the job it belongs to."}
                </p>
              </div>
              <div className="owner-onboarding-grid">
                {creatingDepartment ? (
                  <label htmlFor="department-name">
                    Department name
                    <input
                      id="department-name"
                      // Named outright: the rule's line sits inside the label.
                      aria-label="Department name"
                      value={departmentName}
                      maxLength={100}
                      onChange={(event) =>
                        setDepartmentName(event.target.value)
                      }
                      placeholder="Front of house"
                      required
                      {...letterRuleProps(departmentName, "department-name")}
                    />
                    <LetterRuleNote value={departmentName} id="department-name" />
                  </label>
                ) : (
                  <>
                    <label htmlFor="job-department">
                      Department
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
                    <label htmlFor="job-name">
                      Job or role
                      <input
                        id="job-name"
                        // Named outright: the rule's line sits inside the label.
                        aria-label="Job or role"
                        value={jobName}
                        maxLength={100}
                        onChange={(event) => setJobName(event.target.value)}
                        placeholder="Server"
                        required
                        {...letterRuleProps(jobName, "job-name")}
                      />
                      <LetterRuleNote value={jobName} id="job-name" />
                    </label>
                  </>
                )}
              </div>
              <Feedback success={success} />
              <WizardBar
                back={{ label: "Locations", onClick: () => setStep(2) }}
                error={error}
              >
                {creatingDepartment ? (
                  <>
                    {ownDepartmentCount > 0 ? (
                      <button
                        type="button"
                        className="pb-btn pb-btn-secondary"
                        disabled={submitting}
                        onClick={() => {
                          setAddingDepartment(false);
                          setDepartmentName("");
                        }}
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button
                      className="pb-btn pb-btn-secondary"
                      type="submit"
                      disabled={
                        submitting ||
                        departmentName.trim().length === 0 ||
                        breaksLetterRule(departmentName)
                      }
                    >
                      <Plus size={15} aria-hidden /> Add department
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="pb-btn pb-btn-secondary"
                      disabled={submitting}
                      onClick={() => setAddingDepartment(true)}
                    >
                      <Plus size={15} aria-hidden /> New department
                    </button>
                    <button
                      className="pb-btn pb-btn-secondary"
                      type="submit"
                      disabled={
                        submitting || jobName.trim().length === 0 || breaksLetterRule(jobName)
                      }
                    >
                      <BriefcaseBusiness size={15} aria-hidden /> Add job
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="pb-btn pb-btn-primary"
                  disabled={submitting || !structureReady}
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
                    setEmployeeDraft({ ...employeeDraft, job_ids: ids })
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
                  confirmLabel="Confirm clear"
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
      {/* Nine fields in one flat run read as a wall. Three named groups
          say what each answer is for. */}
      <fieldset className="ob-fieldset">
        <legend>What the app calls it</legend>
      <label htmlFor="location-name">
        Location name
        <input
          id="location-name"
          // Named outright: the rule's line sits inside the label.
          aria-label="Location name"
          value={draft.name}
          maxLength={120}
          onChange={(event) => onChange({ ...draft, name: event.target.value }, "name")}
          placeholder="Main dining room"
          required
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={fieldNoteId("location-name", errors.name)}
        />
        <FieldNote id="location-name" error={errors.name} />
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
          aria-describedby={fieldNoteId("location-short-name", errors.short_name)}
          aria-required
        />
        <FieldNote id="location-short-name" error={errors.short_name} />
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
      </fieldset>
      <fieldset className="ob-fieldset">
        <legend>Address</legend>
      <label className="wide" htmlFor="location-street">
        Street address
        <input
          id="location-street"
          // Named outright: the rule's line sits inside the label.
          aria-label="Street address"
          value={draft.street_address}
          maxLength={180}
          onChange={(event) =>
            onChange({ ...draft, street_address: event.target.value }, "street_address")
          }
          aria-invalid={errors.street_address ? true : undefined}
          aria-describedby={fieldNoteId("location-street", errors.street_address)}
        />
        <FieldNote id="location-street" error={errors.street_address} />
      </label>
      <label htmlFor="location-city">
        City
        <input
          id="location-city"
          // Named outright: the rule's line sits inside the label.
          aria-label="City"
          value={draft.city}
          maxLength={100}
          onChange={(event) => onChange({ ...draft, city: event.target.value }, "city")}
          aria-invalid={errors.city ? true : undefined}
          aria-describedby={fieldNoteId("location-city", errors.city)}
        />
        <FieldNote id="location-city" error={errors.city} />
      </label>
      <label htmlFor="location-region">
        State or region
        <input
          id="location-region"
          // Named outright: the rule's line sits inside the label.
          aria-label="State or region"
          value={draft.region}
          maxLength={100}
          onChange={(event) =>
            onChange({ ...draft, region: event.target.value }, "region")
          }
          aria-invalid={errors.region ? true : undefined}
          aria-describedby={fieldNoteId("location-region", errors.region)}
        />
        <FieldNote id="location-region" error={errors.region} />
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
      </fieldset>
      <fieldset className="ob-fieldset">
        <legend>Contact</legend>
      <label htmlFor="location-phone">
        Phone number (optional)
        <UsPhoneInput
          id="location-phone"
          // Named outright: the +1 sits inside the label.
          aria-label="Phone number (optional)"
          value={draft.phone}
          onChange={(phone) => onChange({ ...draft, phone }, "phone")}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={fieldNoteId("location-phone", errors.phone)}
        />
        <FieldNote id="location-phone" error={errors.phone} />
      </label>
      </fieldset>
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
  readonly options: readonly {
    readonly id: string;
    readonly name: string;
    readonly system_key?: string | null;
  }[];
  readonly selected: readonly string[];
  readonly required: boolean;
  readonly onChange: (ids: string[]) => void;
}) {
  const reasonId = useId();
  const hasOwnerJob = options.some((option) => option.system_key === "owner");
  return (
    <fieldset className="owner-assignment-checks wide">
      <legend>
        {legend}
        {required ? <span> · required</span> : null}
      </legend>
      {options.map((option) => {
        // The Owner job is nobody's to tick, as in the Employees drawer (BL-489).
        const owner = option.system_key === "owner";
        return (
          <label
            key={option.id}
            title={owner ? ownerJobReason : undefined}
            data-locked={owner ? "true" : undefined}
            data-locked-reason={owner ? "true" : undefined}
          >
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              disabled={owner}
              aria-describedby={owner ? reasonId : undefined}
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
        );
      })}
      {hasOwnerJob ? (
        <span id={reasonId} className="sr-only">
          {ownerJobReason}
        </span>
      ) : null}
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
          // Named outright: the rule's line sits inside the label.
          aria-label="First name"
          value={draft.first_name}
          maxLength={80}
          onChange={(event) =>
            onChange({ ...draft, first_name: event.target.value })
          }
          required
          {...letterRuleProps(draft.first_name, "employee-first-name")}
        />
        <LetterRuleNote value={draft.first_name} id="employee-first-name" />
      </label>
      <label htmlFor="employee-last-name">
        Last name
        <input
          id="employee-last-name"
          // Named outright: the rule's line sits inside the label.
          aria-label="Last name"
          value={draft.last_name}
          maxLength={80}
          onChange={(event) =>
            onChange({ ...draft, last_name: event.target.value })
          }
          required
          {...letterRuleProps(draft.last_name, "employee-last-name")}
        />
        <LetterRuleNote value={draft.last_name} id="employee-last-name" />
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

function countLabel(count: number, noun: string): string {
  return count + " " + noun + (count === 1 ? "" : "s");
}

/** The jobs in one department, and the way into one of them. */
function JobChips({
  jobs,
  empty,
  openJobId,
  disabled,
  onOpen,
}: {
  readonly jobs: readonly Job[];
  readonly empty: string;
  readonly openJobId: string | null;
  readonly disabled: boolean;
  readonly onOpen: (job: Job) => void;
}) {
  if (jobs.length === 0)
    return empty ? <p className="ob-empty">{empty}</p> : null;
  return (
    <div className="ob-chips">
      {jobs.map((job) => (
        <button
          key={job.id}
          type="button"
          className="ob-chip"
          disabled={disabled}
          aria-expanded={openJobId === job.id}
          onClick={() => onOpen(job)}
        >
          {job.name}
        </button>
      ))}
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
  const [locations, { departments, jobs }] = await Promise.all([
    listLocations(workspaceId),
    loadDepartmentsAndJobs(workspaceId),
  ]);
  return { locations, departments, jobs };
}
