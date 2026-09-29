import {
  normalizeAccountPhone,
  type EmploymentContactRecord,
  type OwnerLegalName,
} from "@newfork/shared";
import { Button, ConfirmButton } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  listOwnEmploymentRecords,
  listWorkspaceIdentities,
  removeAccountAvatar,
  supabaseClient,
  uploadAccountAvatar,
} from "../lib/supabase";
import {
  requestPreferredName,
  saveOwnEmploymentContact,
} from "../employees/employee-data";
import { AccountPageHeader } from "./components";
import {
  legalNameErrorMessage,
  onboardingUnfinished,
  ownedWorkspaces,
  useAccountWorkspaces,
  useOwnLegalName,
  useSaveOwnLegalName,
} from "./legal-name-data";
import { useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { validateAvatarFile } from "./avatar-crop";
import { AccountAvatar } from "./AccountAvatar";
import { roleLabel } from "../shell/prebiz/PreBiz";

export default function ProfilePage() {
  const { account, updateAccount } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [avatarObjectPath, setAvatarObjectPath] = useState(account?.avatarObjectPath ?? null);
  const [avatarUrl, setAvatarUrl] = useState(account?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  useEffect(() => {
    if (!draftFile) return;
    const url = URL.createObjectURL(draftFile);
    setAvatarUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draftFile]);

  useEffect(() => {
    if (!account || dirty) return;
    setDisplayName(account.displayName);
    setPhone(account.phone ?? "");
    setAvatarObjectPath(account.avatarObjectPath);
    setAvatarUrl(account.avatarUrl);
  }, [account, dirty]);

  const navigationDialog = useAvailabilityNavigationGuard({
    dirty, busy: saving || Boolean(cropFile), onDiscard: () => discard(),
    labels: { saving: "Saving profile", discard: "Discard profile changes?", saved: "Profile saved",
      unsaved: "Your unsaved profile changes will be lost." },
  });

  if (!account) return null;

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
  };

  const closeCropDialog = () => {
    setCropFile(null);
    requestAnimationFrame(() =>
      document.getElementById("profile-photo-upload-trigger")?.focus(),
    );
  };

  const discard = () => {
    setDraftFile(null);
    setDisplayName(account.displayName);
    setPhone(account.phone ?? "");
    setAvatarObjectPath(account.avatarObjectPath);
    setAvatarUrl(account.avatarUrl);
    setDirty(false);
    setSaved(false);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    let profileSaved = false;
    try {
      const normalizedPhone = normalizeAccountPhone(phone);
      const previousAvatarPath = account.avatarObjectPath;
      let nextAvatar = { avatarObjectPath, avatarUrl };
      if (draftFile) {
        if (!supabaseClient) throw new Error("Account photo storage is not configured");
        nextAvatar = await uploadAccountAvatar(supabaseClient, account.userId, draftFile);
      }
      await updateAccount(displayName, account.theme, normalizedPhone, {
        ...nextAvatar,
      });
      profileSaved = true;
      setDraftFile(null);
      setAvatarObjectPath(nextAvatar.avatarObjectPath);
      setAvatarUrl(nextAvatar.avatarUrl);
      setDirty(false);
      setSaved(true);
      if (supabaseClient && previousAvatarPath && previousAvatarPath !== nextAvatar.avatarObjectPath) {
        await removeAccountAvatar(supabaseClient, account.userId, previousAvatarPath);
      }
    } catch (saveError: unknown) {
      // A failed save response may follow a committed profile write. Do not
      // delete the new object on that ambiguous outcome and break its reference.
      setError(profileSaved ? "Profile saved, but the previous photo could not be removed."
        : saveError instanceof Error ? saveError.message : "Profile could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const selectAvatar = (file: File | undefined) => {
    if (!file) return;
    if (!supabaseClient) {
      setError("Account photo storage is not configured");
      return;
    }
    setError(null);
    try {
      validateAvatarFile(file);
      setCropFile(file);
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : "Photo could not be uploaded");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <section className="account-page" aria-labelledby="profile-title">
      {navigationDialog}
      {cropFile ? <AvatarCropDialog file={cropFile} onCancel={closeCropDialog} onConfirm={file => {
        setDraftFile(file); closeCropDialog(); markDirty();
      }} /> : null}
      <AccountPageHeader
        title="Profile"
        titleId="profile-title"
        description="Your personal details, and the record each workspace keeps of you."
      />
      <form className="account-section-block" aria-labelledby="account-details-title" onSubmit={submit}>
        <div className="account-section-copy">
          <h2 id="account-details-title">Personal details</h2>
          <p>Your photo, display name and phone number follow you into every workspace. Changing them does not rewrite an existing employee legal name.</p>
        </div>
        <div className="account-section-body">
          <div className="account-avatar-row">
            <AccountAvatar globalUrl={avatarUrl} className="account-avatar-large" name={displayName} />
            <div className="account-avatar-controls">
              <div className="account-button-row">
                <Button id="profile-photo-upload-trigger" type="button" disabled={saving} onClick={() => fileInput.current?.click()}>
                  <Camera size={15} aria-hidden /> {avatarUrl ? "Replace" : "Upload"}
                </Button>
                <ConfirmButton
                  className="danger-button"
                  disabled={saving || (!avatarObjectPath && !draftFile)}
                  confirmLabel="Confirm remove"
                  onConfirm={() => {
                    setDraftFile(null);
                    setAvatarObjectPath(null);
                    setAvatarUrl(null);
                    markDirty();
                  }}
                >
                  <Trash2 size={15} aria-hidden /> Remove
                </ConfirmButton>
              </div>
              <span className="field-help">Profile photo · JPG, PNG or WebP · up to 5 MB</span>
            </div>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose profile photo"
              disabled={saving}
              onChange={(event) => selectAvatar(event.target.files?.[0])}
            />
          </div>
          <div className="account-field-grid">
            <label className="account-field" htmlFor="account-display-name">
              <span>Display name</span>
              <input
                id="account-display-name"
                aria-label="Display name"
                value={displayName}
                maxLength={100}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  markDirty();
                }}
                required
              />
            </label>
            <label className="account-field" htmlFor="account-phone-number">
              <span>
                Phone number<span className="field-optional">optional</span>
              </span>
              {/* Without a leading +, the number is read as a US/Canada number. */}
              <input
                id="account-phone-number"
                aria-label="Phone number"
                type="tel"
                value={phone}
                maxLength={30}
                onChange={(event) => {
                  setPhone(event.target.value);
                  markDirty();
                }}
                placeholder="415 555 0142"
              />
              <small>Outside the US or Canada, start with + and the country code.</small>
            </label>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {saved ? <p className="form-success" role="status">Profile saved</p> : null}
          <div className="account-form-actions">
            {dirty ? (
              <Button type="button" className="secondary-button" disabled={saving} onClick={() => void discard()}>
                Discard
              </Button>
            ) : null}
            <Button type="submit" disabled={!dirty || saving || !displayName.trim()}>
              {saving ? "Saving" : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
      <OwnerLegalNames />
      <WorkspaceIdentities />
      <EmploymentContacts />
    </section>
  );
}

/**
 * The owner's legal name: the name on their ID, which documents and
 * signatures read. Given at the first step of setup; changed here, and each
 * change goes to the audit log. Shown only where this account is the owner.
 */
function OwnerLegalNames() {
  const workspaces = useAccountWorkspaces();
  const owned = ownedWorkspaces(workspaces.data);
  if (owned.length === 0) return null;

  return (
    <section className="account-section-block" aria-labelledby="account-legal-name-title">
      <div className="account-section-copy">
        <h2 id="account-legal-name-title">Legal name</h2>
        <p>
          The name as it appears on your ID. Documents and signatures use it;
          every change is recorded.
        </p>
      </div>
      <div className="account-section-body">
        {owned.map((workspace) => (
          <OwnerLegalNameBlock
            key={workspace.id}
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            showName={owned.length > 1}
          />
        ))}
      </div>
    </section>
  );
}

function OwnerLegalNameBlock({
  workspaceId,
  workspaceName,
  showName,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly showName: boolean;
}) {
  const legalName = useOwnLegalName(workspaceId);
  // Kept above the form, which starts over when the saved name comes back.
  const save = useSaveOwnLegalName(workspaceId);
  if (legalName.isPending) return null;
  // A failed read is not a failed save: the save wording would send the owner
  // looking for a change they never made.
  if (legalName.isError)
    return (
      <p className="form-error" role="alert">
        Your legal name could not be loaded. Reload the page to try again.
      </p>
    );
  return (
    <OwnerLegalNameForm
      // A saved name comes back from the server and starts a clean form.
      key={JSON.stringify(legalName.data)}
      workspaceId={workspaceId}
      workspaceName={showName ? workspaceName : null}
      initial={legalName.data ?? { firstName: "", middleName: "", lastName: "" }}
      save={save}
    />
  );
}

function OwnerLegalNameForm({
  workspaceId,
  workspaceName,
  initial,
  save,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string | null;
  readonly initial: OwnerLegalName;
  readonly save: ReturnType<typeof useSaveOwnLegalName>;
}) {
  const [draft, setDraft] = useState(initial);
  const dirty =
    draft.firstName !== initial.firstName ||
    draft.middleName !== initial.middleName ||
    draft.lastName !== initial.lastName;
  const ready = draft.firstName.trim() !== "" && draft.lastName.trim() !== "";
  const field = (suffix: string) => `legal-name-${workspaceId}-${suffix}`;
  const input = (part: keyof OwnerLegalName, label: string, suffix: string) => (
    <label className="account-field" htmlFor={field(suffix)}>
      <span>
        {label}
        {part === "middleName" ? (
          <span className="field-optional">optional</span>
        ) : null}
      </span>
      <input
        id={field(suffix)}
        aria-label={`Legal ${label.toLowerCase()}`}
        value={draft[part]}
        maxLength={80}
        required={part !== "middleName"}
        onChange={(event) => {
          save.reset();
          setDraft({ ...draft, [part]: event.target.value });
        }}
      />
    </label>
  );

  return (
    <form
      className="account-employment-record"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          firstName: draft.firstName.trim(),
          middleName: draft.middleName.trim(),
          lastName: draft.lastName.trim(),
        });
      }}
    >
      {workspaceName ? <strong>{workspaceName}</strong> : null}
      <div className="account-field-grid account-legal-name-grid">
        {input("firstName", "First name", "first")}
        {input("middleName", "Middle name", "middle")}
        {input("lastName", "Last name", "last")}
      </div>
      {save.isError ? (
        <p className="form-error" role="alert">
          {legalNameErrorMessage(save.error)}
        </p>
      ) : null}
      {save.isSuccess ? (
        <p className="form-success" role="status">
          Legal name saved
        </p>
      ) : null}
      <div className="account-button-row">
        <Button type="submit" disabled={save.isPending || !dirty || !ready}>
          {save.isPending ? "Saving" : "Save legal name"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The account is one thing; each workspace keeps its own record of the person.
 * Editing the name above changes what teammates see; it does not touch the name
 * a workspace files them under, and until now nothing said so.
 */
function WorkspaceIdentities() {
  const identities = useQuery({
    queryKey: ["account-workspace-identities"],
    queryFn: () =>
      supabaseClient ? listWorkspaceIdentities(supabaseClient) : [],
  });

  if (identities.isLoading || (identities.data ?? []).length === 0) return null;

  return (
    <section className="account-section-block" aria-labelledby="account-identities-title">
      <div className="account-section-copy">
        <h2 id="account-identities-title">How you appear in each workspace</h2>
        <p>
          Your account is yours. Each workspace keeps its own record of you, and
          a manager there can correct it.
        </p>
      </div>
      <div className="account-section-body">
        <ul className="account-identity-list">
          {(identities.data ?? []).map((identity) => (
            <li key={identity.workspaceId}>
              <span className="account-identity-where">
                <strong>{identity.workspaceName}</strong>
                <span>{roleLabel[identity.role]}</span>
              </span>
              <span className="account-identity-who">
                {identity.employeeName ?? "No record yet"}
                {identity.employeeCode ? (
                  <small>{identity.employeeCode}</small>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Who to call, and the number to reach you on. Onboarding asks for both once
 * and never comes back to them; an owner is never asked at all, because an
 * owner never runs onboarding.
 *
 * One block per workspace, because that is where the record lives. A phone
 * number changes and a person moves house, and until now the only way to
 * correct either was to ask a manager.
 */
function EmploymentContacts() {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const workspaces = useAccountWorkspaces();
  const records = useQuery({
    queryKey: ["account-employment-records"],
    queryFn: () =>
      supabaseClient ? listOwnEmploymentRecords(supabaseClient) : [],
  });

  if (records.isLoading || (records.data ?? []).length === 0) return null;

  return (
    <section
      className="account-section-block"
      aria-labelledby="account-employment-title"
    >
      <div className="account-section-copy">
        <h2 id="account-employment-title">Who to reach</h2>
        <p>
          Kept by each workspace separately, and yours to correct. A preferred
          name is what people there call you; the name on documents and
          signatures stays the one the workspace has on file.
        </p>
      </div>
      <div className="account-section-body">
        {(records.data ?? []).map((record) =>
          // Nothing to keep a contact on until onboarding writes the record;
          // the database would refuse the save.
          onboardingUnfinished(workspaces.data, record.workspaceId) ? (
            <div key={record.workspaceId} className="account-employment-record">
              <strong>{record.workspaceName}</strong>
              <p className="account-record-note">
                Finish setting up your account here, then you can add your
                phone number and emergency contact.
              </p>
              <div className="account-button-row">
                <Button
                  type="button"
                  aria-label={`Continue setup for ${record.workspaceName}`}
                  onClick={() => navigate(`/welcome/${record.workspaceId}`)}
                >
                  Continue setup
                </Button>
              </div>
            </div>
          ) : (
            <EmploymentContactForm
              key={record.workspaceId}
              record={record}
              onSaved={() =>
                cache.invalidateQueries({
                  queryKey: ["account-employment-records"],
                })
              }
            />
          ),
        )}
      </div>
    </section>
  );
}

function EmploymentContactForm({
  record,
  onSaved,
}: {
  readonly record: EmploymentContactRecord;
  readonly onSaved: () => void;
}) {
  const [name, setName] = useState(record.emergencyContactName);
  const [relationship, setRelationship] = useState(
    record.emergencyContactRelationship,
  );
  const [contactPhone, setContactPhone] = useState(
    record.emergencyContactPhone,
  );
  const [personalPhone, setPersonalPhone] = useState(record.phone ?? "");
  const [preferred, setPreferred] = useState(record.preferredName);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // What the workspace did with the name: took it, or held it for somebody to
  // answer. A refusal is never reported, so this never says one happened.
  const [nameOutcome, setNameOutcome] = useState<string | null>(null);

  const dirty =
    name !== record.emergencyContactName ||
    relationship !== record.emergencyContactRelationship ||
    contactPhone !== record.emergencyContactPhone ||
    personalPhone !== (record.phone ?? "") ||
    preferred !== record.preferredName;
  // The row will not accept half a contact, so neither does the form. A
  // preferred name on its own is fine: it is not part of that row.
  const contactTouched =
    name !== record.emergencyContactName ||
    relationship !== record.emergencyContactRelationship ||
    contactPhone !== record.emergencyContactPhone ||
    personalPhone !== (record.phone ?? "");
  const ready =
    !contactTouched ||
    (name.trim().length > 0 && contactPhone.trim().length >= 7);

  const save = async (): Promise<void> => {
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      if (name.trim().length > 0)
        await saveOwnEmploymentContact(record.workspaceId, record.employeeId, {
          name,
          relationship,
          phone: contactPhone,
          email: record.emergencyContactEmail,
          personalPhone: personalPhone.trim(),
        });
      if (preferred !== record.preferredName) {
        const outcome = await requestPreferredName(
          record.workspaceId,
          record.employeeId,
          preferred.trim(),
        );
        setNameOutcome(
          outcome === "waiting"
            ? "Sent to this workspace to answer."
            : outcome === "cleared"
              ? "People here will see the name on file again."
              : "People here will see it from now on.",
        );
      }
      setSaved(true);
      onSaved();
    } catch {
      setFailure("That could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const field = (suffix: string) =>
    `employment-${record.workspaceId}-${suffix}`;

  return (
    <form
      className="account-employment-record"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <strong>{record.workspaceName}</strong>
      <div className="account-field-grid">
        <label className="account-field" htmlFor={field("preferred")}>
          <span>Preferred name</span>
          <input
            id={field("preferred")}
            value={preferred}
            maxLength={80}
            onChange={(event) => setPreferred(event.target.value)}
            placeholder="Optional"
          />
          <small>
            What people here call you. Documents and signatures use the name on
            file.
          </small>
        </label>
        <label className="account-field" htmlFor={field("own-phone")}>
          <span>Your phone number</span>
          <input
            id={field("own-phone")}
            value={personalPhone}
            maxLength={30}
            onChange={(event) => setPersonalPhone(event.target.value)}
            placeholder="415 555 0142"
          />
        </label>
        <label className="account-field" htmlFor={field("contact-name")}>
          <span>Emergency contact</span>
          <input
            id={field("contact-name")}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Morgan Reyes"
          />
        </label>
        <label className="account-field" htmlFor={field("relationship")}>
          <span>Relationship</span>
          <input
            id={field("relationship")}
            value={relationship}
            maxLength={80}
            onChange={(event) => setRelationship(event.target.value)}
            placeholder="Spouse"
          />
        </label>
        <label className="account-field" htmlFor={field("contact-phone")}>
          <span>Emergency phone</span>
          <input
            id={field("contact-phone")}
            value={contactPhone}
            maxLength={30}
            onChange={(event) => setContactPhone(event.target.value)}
            placeholder="415 555 0199"
          />
        </label>
      </div>
      {failure ? (
        <p className="form-error" role="alert">
          {failure}
        </p>
      ) : null}
      {saved && !dirty ? (
        <p className="form-success" role="status">
          {nameOutcome ?? "Saved"}
        </p>
      ) : null}
      <div className="account-button-row">
        <Button type="submit" disabled={busy || !dirty || !ready}>
          {busy ? "Saving" : "Save"}
        </Button>
      </div>
    </form>
  );
}
