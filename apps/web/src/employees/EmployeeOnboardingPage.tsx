import {
  employeeOnboardingProfileSchema,
  type EmployeeAvailabilityInput,
  type EmployeeOnboarding,
  type EmployeeOnboardingProfile,
  type EmployeeOnboardingRequirement,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CircleAlert,
  FileCheck2,
  FileUp,
  IdCard,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import {
  acknowledgeMyRequirement,
  getMyOnboarding,
  saveMyAvailability,
  saveMyOnboardingProfile,
  saveMySsn,
  submitMyOnboarding,
  uploadMyDocument,
} from "./onboarding-data";

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export default function EmployeeOnboardingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const onboarding = useQuery({
    queryKey: ["my-employee-onboarding"],
    queryFn: getMyOnboarding,
  });

  const continueAfterSave = async () => {
    const refreshed = await onboarding.refetch();
    if (refreshed.data) navigate(refreshed.data.first_actionable_path);
  };

  if (onboarding.isLoading)
    return (
      <main
        className="employee-onboarding-loading"
        aria-label="Loading onboarding"
      />
    );
  if (onboarding.error || !onboarding.data)
    return (
      <main className="employee-onboarding-error">
        <CircleAlert size={24} aria-hidden />
        <h1>Onboarding is unavailable</h1>
        <p>{errorMessage(onboarding.error)}</p>
        <Button type="button" onClick={() => onboarding.refetch()}>
          Try again
        </Button>
      </main>
    );

  const model = onboarding.data;
  if (model.case_status === "approved")
    return <Navigate to="/app/employee-hub" replace />;
  const requirementId = location.pathname.split("/").at(-1) ?? "";
  const requirement = model.requirements.find(
    (item) => item.id === requirementId,
  );

  return (
    <main className="employee-onboarding-shell">
      <aside className="employee-onboarding-progress">
        <p className="product-mark">NEWFORK</p>
        <div>
          <span>{model.workspace_name}</span>
          <strong>{model.employee_name}</strong>
        </div>
        <progress
          value={model.progress_completed}
          max={Math.max(model.progress_total, 1)}
        />
        <p>
          {model.progress_completed} of {model.progress_total} complete
        </p>
        <nav aria-label="Onboarding requirements">
          {model.requirements
            .filter((item) => item.required)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  requirementPath(item) === location.pathname ? "active" : ""
                }
                onClick={() => navigate(requirementPath(item))}
              >
                <RequirementIcon requirement={item} />
                <span>{item.title}</span>
              </button>
            ))}
          <button
            type="button"
            className={location.pathname === "/welcome/review" ? "active" : ""}
            onClick={() => navigate("/welcome/review")}
          >
            <FileCheck2 size={17} aria-hidden />
            <span>Review</span>
          </button>
        </nav>
      </aside>
      <section className="employee-onboarding-stage">
        {location.pathname === "/welcome" ? (
          <WelcomeStep
            model={model}
            onContinue={() => navigate(model.first_actionable_path)}
          />
        ) : location.pathname === "/welcome/profile" ? (
          <ProfileStep model={model} onSaved={continueAfterSave} />
        ) : location.pathname === "/welcome/identity" ? (
          <IdentityStep model={model} onSaved={continueAfterSave} />
        ) : location.pathname === "/welcome/availability" ? (
          <AvailabilityStep model={model} onSaved={continueAfterSave} />
        ) : location.pathname === "/welcome/review" ? (
          <ReviewStep model={model} onSaved={continueAfterSave} />
        ) : location.pathname.includes("/documents/") &&
          requirement?.kind === "document" ? (
          <DocumentStep
            model={model}
            requirement={requirement}
            onSaved={continueAfterSave}
          />
        ) : location.pathname.includes("/acknowledgements/") &&
          requirement?.kind === "acknowledgement" ? (
          <AcknowledgementStep
            model={model}
            requirement={requirement}
            onSaved={continueAfterSave}
          />
        ) : (
          <Navigate to={model.first_actionable_path} replace />
        )}
      </section>
    </main>
  );
}

function WelcomeStep({
  model,
  onContinue,
}: {
  readonly model: EmployeeOnboarding;
  readonly onContinue: () => void;
}) {
  return (
    <div className="onboarding-step onboarding-welcome">
      <span className="onboarding-step-icon">
        <UserRound size={24} aria-hidden />
      </span>
      <p className="onboarding-eyebrow">Welcome to {model.workspace_name}</p>
      <h1>Let's prepare your employee account</h1>
      <p className="onboarding-lead">
        Complete your information for manager review before your workspace
        access begins.
      </p>
      <dl className="onboarding-assignment-summary">
        <div>
          <dt>Locations</dt>
          <dd>{model.assignments.locations.join(", ") || "Not assigned"}</dd>
        </div>
        <div>
          <dt>Jobs</dt>
          <dd>{model.assignments.jobs.join(", ") || "Not assigned"}</dd>
        </div>
      </dl>
      <Button type="button" onClick={onContinue}>
        Begin <ArrowRight size={17} aria-hidden />
      </Button>
    </div>
  );
}

function ProfileStep({ model, onSaved }: StepProps) {
  const initial = useMemo<EmployeeOnboardingProfile>(
    () => ({
      legal_first_name: model.profile?.legal_first_name ?? "",
      legal_last_name: model.profile?.legal_last_name ?? "",
      preferred_name: model.profile?.preferred_name ?? "",
      phone: model.profile?.phone ?? "",
      street_address: model.profile?.street_address ?? "",
      city: model.profile?.city ?? "",
      region: model.profile?.region ?? "",
      postal_code: model.profile?.postal_code ?? "",
      country_code: model.profile?.country_code ?? "US",
      date_of_birth: model.profile?.date_of_birth ?? "",
      emergency_contact_name: model.profile?.emergency_contact_name ?? "",
      emergency_contact_phone: model.profile?.emergency_contact_phone ?? "",
      share_phone_with_teammates:
        model.profile?.share_phone_with_teammates ?? false,
      share_email_with_teammates:
        model.profile?.share_email_with_teammates ?? false,
    }),
    [model.profile],
  );
  const [profile, setProfile] = useState(initial);
  const mutation = useMutation({
    mutationFn: () => saveMyOnboardingProfile(profile, model.revision),
    onSuccess: onSaved,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (employeeOnboardingProfileSchema.safeParse(profile).success)
      mutation.mutate();
  };
  return (
    <form className="onboarding-step" onSubmit={submit}>
      <StepHeading
        eyebrow="Profile and privacy"
        title="Your private employee details"
        copy="These details are restricted to authorized employee records."
      />
      <div className="onboarding-form-grid">
        <TextField
          label="Legal first name"
          value={profile.legal_first_name}
          onChange={(value) =>
            setProfile({ ...profile, legal_first_name: value })
          }
        />
        <TextField
          label="Legal last name"
          value={profile.legal_last_name}
          onChange={(value) =>
            setProfile({ ...profile, legal_last_name: value })
          }
        />
        <TextField
          label="Preferred name"
          value={profile.preferred_name}
          onChange={(value) =>
            setProfile({ ...profile, preferred_name: value })
          }
          required={false}
        />
        <TextField
          label="Phone"
          type="tel"
          value={profile.phone}
          onChange={(value) => setProfile({ ...profile, phone: value })}
        />
        <TextField
          label="Date of birth"
          type="date"
          value={profile.date_of_birth}
          onChange={(value) => setProfile({ ...profile, date_of_birth: value })}
        />
        <TextField
          label="Street address"
          value={profile.street_address}
          onChange={(value) =>
            setProfile({ ...profile, street_address: value })
          }
          wide
        />
        <TextField
          label="City"
          value={profile.city}
          onChange={(value) => setProfile({ ...profile, city: value })}
        />
        <TextField
          label="State or region"
          value={profile.region}
          onChange={(value) => setProfile({ ...profile, region: value })}
        />
        <TextField
          label="Postal code"
          value={profile.postal_code}
          onChange={(value) => setProfile({ ...profile, postal_code: value })}
        />
        <TextField
          label="Country code"
          value={profile.country_code}
          maxLength={2}
          onChange={(value) =>
            setProfile({ ...profile, country_code: value.toUpperCase() })
          }
        />
        <TextField
          label="Emergency contact"
          value={profile.emergency_contact_name}
          onChange={(value) =>
            setProfile({ ...profile, emergency_contact_name: value })
          }
        />
        <TextField
          label="Emergency phone"
          type="tel"
          value={profile.emergency_contact_phone}
          onChange={(value) =>
            setProfile({ ...profile, emergency_contact_phone: value })
          }
        />
      </div>
      <fieldset className="onboarding-privacy-options">
        <legend>Team visibility</legend>
        <Toggle
          label="Share my phone with teammates"
          checked={profile.share_phone_with_teammates}
          onChange={(checked) =>
            setProfile({ ...profile, share_phone_with_teammates: checked })
          }
        />
        <Toggle
          label="Share my account email with teammates"
          checked={profile.share_email_with_teammates}
          onChange={(checked) =>
            setProfile({ ...profile, share_email_with_teammates: checked })
          }
        />
      </fieldset>
      <MutationFooter mutation={mutation} />
    </form>
  );
}

function IdentityStep({ model, onSaved }: StepProps) {
  const [ssn, setSsn] = useState("");
  const mutation = useMutation({
    mutationFn: () => saveMySsn(ssn.replace(/\D/g, ""), model.revision),
    onSuccess: onSaved,
  });
  return (
    <form
      className="onboarding-step onboarding-identity"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <StepHeading
        eyebrow="Secure identity"
        title={
          model.ssn_status.present
            ? `Identity saved ending in ${model.ssn_status.last_four}`
            : "Enter your Social Security number"
        }
        copy="This value is encrypted when saved and cannot be displayed again."
        icon={<LockKeyhole size={22} aria-hidden />}
      />
      <label className="onboarding-field onboarding-ssn-field">
        <span>Social Security number</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={11}
          value={ssn}
          onChange={(event) => setSsn(formatSsn(event.target.value))}
          placeholder="000-00-0000"
          required
        />
      </label>
      <MutationFooter
        mutation={mutation}
        disabled={ssn.replace(/\D/g, "").length !== 9}
        label={model.ssn_status.present ? "Replace securely" : "Save securely"}
      />
    </form>
  );
}

function DocumentStep({
  model,
  requirement,
  onSaved,
}: StepProps & { readonly requirement: EmployeeOnboardingRequirement }) {
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose a document first");
      return uploadMyDocument(
        requirement.id,
        file,
        expiryDate || null,
        model.revision,
      );
    },
    onSuccess: onSaved,
  });
  return (
    <form
      className="onboarding-step"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <StepHeading
        eyebrow="Required document"
        title={requirement.title}
        copy={
          requirement.description || "Upload the requested employee document."
        }
        icon={<FileUp size={22} aria-hidden />}
      />
      {requirement.status === "rejected" ? (
        <Attention
          text={requirement.rejection_reason ?? "A replacement is required."}
        />
      ) : null}
      <label className="onboarding-upload">
        <FileUp size={24} aria-hidden />
        <strong>{file?.name ?? "Choose document"}</strong>
        <span>
          {requirement.accepted_formats
            .map((format) => format.toUpperCase())
            .join(", ")}{" "}
          | 10 MB maximum
        </span>
        <input
          type="file"
          accept={acceptValue(requirement.accepted_formats)}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          required
        />
      </label>
      <TextField
        label="Expiry date"
        type="date"
        value={expiryDate}
        onChange={setExpiryDate}
        required={false}
      />
      <MutationFooter
        mutation={mutation}
        disabled={!file}
        label={
          requirement.status === "rejected"
            ? "Upload replacement"
            : "Upload document"
        }
      />
    </form>
  );
}

function AcknowledgementStep({
  model,
  requirement,
  onSaved,
}: StepProps & { readonly requirement: EmployeeOnboardingRequirement }) {
  const [read, setRead] = useState(false);
  const [typedName, setTypedName] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      acknowledgeMyRequirement(
        requirement.id,
        typedName,
        requirement.content_digest ?? "",
        model.revision,
      ),
    onSuccess: onSaved,
  });
  return (
    <form
      className="onboarding-step"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <StepHeading
        eyebrow="Acknowledgement"
        title={requirement.title}
        copy={requirement.description}
        icon={<FileCheck2 size={22} aria-hidden />}
      />
      <article className="onboarding-document-content" tabIndex={0}>
        {requirement.content_text}
      </article>
      <label className="onboarding-intent">
        <input
          type="checkbox"
          checked={read}
          onChange={(event) => setRead(event.target.checked)}
        />
        <span>{requirement.intent_statement}</span>
      </label>
      <TextField
        label="Type your full name"
        value={typedName}
        onChange={setTypedName}
      />
      <MutationFooter
        mutation={mutation}
        disabled={!read || !typedName.trim()}
        label="Acknowledge policy"
      />
    </form>
  );
}

function AvailabilityStep({ model, onSaved }: StepProps) {
  const initial = model.availability ?? defaultAvailability();
  const [availability, setAvailability] =
    useState<EmployeeAvailabilityInput>(initial);
  const mutation = useMutation({
    mutationFn: () => saveMyAvailability(availability, model.revision),
    onSuccess: onSaved,
  });
  const updateDay = (
    index: number,
    mode: "unavailable" | "unrestricted" | "windows",
  ) => {
    const days = availability.days.map((day, dayIndex) =>
      dayIndex === index
        ? {
            ...day,
            mode,
            windows:
              mode === "windows"
                ? day.windows.length
                  ? day.windows
                  : [{ start: "09:00", end: "17:00" }]
                : [],
          }
        : day,
    );
    setAvailability({ ...availability, days });
  };
  return (
    <form
      className="onboarding-step"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <StepHeading
        eyebrow="Availability"
        title="Confirm your recurring week"
        copy="Choose an explicit state for every day."
      />
      <div className="availability-editor">
        {availability.days.map((day, index) => (
          <div className="availability-row" key={day.day}>
            <strong>{weekdays[day.day]}</strong>
            <select
              aria-label={`${weekdays[day.day]} availability`}
              value={day.mode}
              onChange={(event) =>
                updateDay(index, event.target.value as typeof day.mode)
              }
            >
              <option value="unrestricted">Available anytime</option>
              <option value="unavailable">Unavailable</option>
              <option value="windows">Specific hours</option>
            </select>
            {day.mode === "windows" ? (
              <div className="availability-times">
                <input
                  aria-label={`${weekdays[day.day]} start`}
                  type="time"
                  value={day.windows[0]?.start ?? "09:00"}
                  onChange={(event) =>
                    setAvailability({
                      ...availability,
                      days: availability.days.map(
                        (candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                windows: [
                                  {
                                    start: event.target.value,
                                    end: candidate.windows[0]?.end ?? "17:00",
                                  },
                                ],
                              }
                            : candidate,
                      ),
                    })
                  }
                />
                <span>to</span>
                <input
                  aria-label={`${weekdays[day.day]} end`}
                  type="time"
                  value={day.windows[0]?.end ?? "17:00"}
                  onChange={(event) =>
                    setAvailability({
                      ...availability,
                      days: availability.days.map(
                        (candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                windows: [
                                  {
                                    start:
                                      candidate.windows[0]?.start ?? "09:00",
                                    end: event.target.value,
                                  },
                                ],
                              }
                            : candidate,
                      ),
                    })
                  }
                />
              </div>
            ) : (
              <span className="availability-explicit">
                <Check size={15} aria-hidden /> Confirmed
              </span>
            )}
          </div>
        ))}
      </div>
      <MutationFooter mutation={mutation} label="Confirm availability" />
    </form>
  );
}

function ReviewStep({ model, onSaved }: StepProps) {
  const mutation = useMutation({
    mutationFn: () => submitMyOnboarding(model.revision),
    onSuccess: onSaved,
  });
  const ready = model.requirements
    .filter((item) => item.required)
    .every(
      (item) =>
        item.status === "completed" || item.status === "awaiting_review",
    );
  return (
    <div className="onboarding-step">
      <StepHeading
        eyebrow="Review"
        title={
          model.case_status === "submitted"
            ? "Submitted for manager review"
            : "Review your onboarding"
        }
        copy={
          model.case_status === "submitted"
            ? "Your account remains pending until the review is complete."
            : "Check each requirement before submitting."
        }
      />
      <div className="onboarding-review-list">
        {model.requirements
          .filter((item) => item.required)
          .map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => window.location.assign(requirementPath(item))}
            >
              <RequirementIcon requirement={item} />
              <span>
                <strong>{item.title}</strong>
                <small>{statusLabel(item.status)}</small>
              </span>
              <ArrowRight size={16} aria-hidden />
            </button>
          ))}
      </div>
      {model.case_status !== "submitted" ? (
        <MutationFooter
          mutation={mutation}
          disabled={!ready}
          label="Submit for review"
        />
      ) : null}
    </div>
  );
}

interface StepProps {
  readonly model: EmployeeOnboarding;
  readonly onSaved: () => Promise<void>;
}

function StepHeading({
  eyebrow,
  title,
  copy,
  icon,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly copy: string;
  readonly icon?: ReactNode;
}) {
  return (
    <header className="onboarding-step-heading">
      {icon ? <span>{icon}</span> : null}
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <div>{copy}</div>
    </header>
  );
}

function MutationFooter({
  mutation,
  disabled = false,
  label = "Save and continue",
}: {
  readonly mutation: { isPending: boolean; error: unknown; mutate: () => void };
  readonly disabled?: boolean;
  readonly label?: string;
}) {
  return (
    <footer className="onboarding-step-footer">
      {mutation.error ? (
        <p className="form-error" role="alert">
          {errorMessage(mutation.error)}
        </p>
      ) : (
        <span />
      )}
      <Button type="submit" disabled={disabled || mutation.isPending}>
        {mutation.isPending ? "Saving" : label}
        <ArrowRight size={17} aria-hidden />
      </Button>
    </footer>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = true,
  wide = false,
  maxLength,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly required?: boolean;
  readonly wide?: boolean;
  readonly maxLength?: number;
}) {
  return (
    <label className={`onboarding-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="onboarding-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden>
        <i />
      </span>
      <strong>{label}</strong>
    </label>
  );
}

function Attention({ text }: { readonly text: string }) {
  return (
    <p className="onboarding-attention">
      <CircleAlert size={17} aria-hidden />
      {text}
    </p>
  );
}

function RequirementIcon({
  requirement,
}: {
  readonly requirement: EmployeeOnboardingRequirement;
}) {
  if (
    requirement.status === "completed" ||
    requirement.status === "awaiting_review"
  )
    return <Check size={17} aria-hidden />;
  if (requirement.status === "rejected")
    return <CircleAlert size={17} aria-hidden />;
  if (requirement.kind === "ssn") return <IdCard size={17} aria-hidden />;
  return <span className="requirement-dot" aria-hidden />;
}

function requirementPath(requirement: EmployeeOnboardingRequirement): string {
  if (requirement.kind === "profile") return "/welcome/profile";
  if (requirement.kind === "ssn") return "/welcome/identity";
  if (requirement.kind === "availability") return "/welcome/availability";
  if (requirement.kind === "document")
    return `/welcome/documents/${requirement.id}`;
  return `/welcome/acknowledgements/${requirement.id}`;
}

function defaultAvailability(): EmployeeAvailabilityInput {
  return {
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
    days: weekdays.map((_, day) => ({
      day,
      mode: "unrestricted" as const,
      windows: [],
    })),
  };
}

function formatSsn(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5)]
    .filter(Boolean)
    .join("-");
}

function acceptValue(formats: readonly string[]): string {
  const values = formats.flatMap((format) =>
    format === "pdf"
      ? ["application/pdf"]
      : format === "jpeg"
        ? ["image/jpeg"]
        : [`image/${format}`],
  );
  return values.join(",");
}

function statusLabel(value: EmployeeOnboardingRequirement["status"]): string {
  return {
    not_started: "Not started",
    in_progress: "In progress",
    awaiting_review: "Awaiting review",
    completed: "Complete",
    rejected: "Changes requested",
    manual_follow_up: "Follow-up required",
    superseded: "Superseded",
  }[value];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Onboarding request failed";
}
