import {
  normalizeAccountPhone,
  type EmploymentContactRecord,
  type OwnerLegalName,
} from "@newfork/shared";
import { Button, ConfirmButton } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  listOwnEmploymentRecords,
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

/**
 * What the page's one Save needs from each legal name form. The legal name is
 * written per owned workspace and the rest of the profile to the account, so
 * the forms keep their own draft and report it up instead of saving alone.
 */
type LegalNameHandle = {
  readonly dirty: boolean;
  readonly ready: boolean;
  readonly save: () => Promise<void>;
  readonly reset: () => void;
};
type RegisterLegalName = (
  workspaceId: string,
  handle: LegalNameHandle | null,
) => void;

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
  const legalForms = useRef(new Map<string, LegalNameHandle>());
  const [legalState, setLegalState] = useState<
    Record<string, { readonly dirty: boolean; readonly ready: boolean }>
  >({});
  const registerLegalName = useCallback<RegisterLegalName>(
    (workspaceId, handle) => {
      if (handle) legalForms.current.set(workspaceId, handle);
      else legalForms.current.delete(workspaceId);
      setLegalState((current) => {
        const before = current[workspaceId];
        if (
          handle &&
          before?.dirty === handle.dirty &&
          before.ready === handle.ready
        )
          return current;
        if (!handle && !before) return current;
        const next = { ...current };
        if (handle) next[workspaceId] = { dirty: handle.dirty, ready: handle.ready };
        else delete next[workspaceId];
        return next;
      });
    },
    [],
  );
  const legalDirty = Object.values(legalState).some((form) => form.dirty);
  const legalReady = Object.values(legalState).every(
    (form) => !form.dirty || form.ready,
  );
  const formDirty = dirty || legalDirty;

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
    dirty: formDirty, busy: saving || Boolean(cropFile), onDiscard: () => discard(),
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
    for (const form of legalForms.current.values()) form.reset();
    setDirty(false);
    setSaved(false);
    setError(null);
  };

  /** Saves the account part; returns what went wrong, or null. */
  const saveProfile = async (): Promise<string | null> => {
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
      if (supabaseClient && previousAvatarPath && previousAvatarPath !== nextAvatar.avatarObjectPath) {
        await removeAccountAvatar(supabaseClient, account.userId, previousAvatarPath);
      }
      return null;
    } catch (saveError: unknown) {
      // A failed save response may follow a committed profile write. Do not
      // delete the new object on that ambiguous outcome and break its reference.
      return profileSaved ? "Profile saved, but the previous photo could not be removed."
        : saveError instanceof Error ? saveError.message : "Profile could not be saved";
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const failures: string[] = [];
    if (dirty) {
      const failure = await saveProfile();
      if (failure) failures.push(failure);
    }
    for (const form of legalForms.current.values()) {
      if (!form.dirty) continue;
      try {
        await form.save();
      } catch (legalError: unknown) {
        failures.push(legalNameErrorMessage(legalError));
      }
    }
    if (failures.length > 0) setError(failures.join(" "));
    else setSaved(true);
    setSaving(false);
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
        description="Your name, photo and phone, and who to call in an emergency."
      />
      <form className="account-profile-form" aria-label="Personal details" onSubmit={submit}>
        <div className="account-profile-head">
          <AccountAvatar globalUrl={avatarUrl} className="account-avatar-large" name={displayName} />
          <div className="account-profile-identity">
            <strong>{displayName.trim() || account.displayName}</strong>
            <span>{account.email}</span>
            <div className="account-photo-actions">
              <Button id="profile-photo-upload-trigger" type="button" disabled={saving} onClick={() => fileInput.current?.click()}>
                <Camera size={15} aria-hidden /> {avatarUrl ? "Replace" : "Upload"}
              </Button>
              {avatarObjectPath || draftFile ? <ConfirmButton
                className="danger-button"
                disabled={saving}
                confirmLabel="Confirm remove"
                onConfirm={() => {
                  setDraftFile(null);
                  setAvatarObjectPath(null);
                  setAvatarUrl(null);
                  markDirty();
                }}
              >
                <Trash2 size={15} aria-hidden /> Remove
              </ConfirmButton> : null}
              <span className="field-help">JPG, PNG or WebP · up to 5 MB</span>
            </div>
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

        <OwnerLegalNames register={registerLegalName} onEdit={() => setSaved(false)} />

        <div className="account-field-grid account-profile-grid">
          <label className="account-field" htmlFor="account-display-name">
            <span>Preferred name</span>
            <input
              id="account-display-name"
              aria-label="Preferred name"
              value={displayName}
              maxLength={100}
              onChange={(event) => {
                setDisplayName(event.target.value);
                markDirty();
              }}
              required
            />
            <small>What people see across Newfork.</small>
          </label>
          <label className="account-field account-field-span-2" htmlFor="account-phone-number">
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
          {formDirty ? (
            <Button type="button" className="secondary-button" disabled={saving} onClick={() => void discard()}>
              Discard
            </Button>
          ) : null}
          <Button type="submit" disabled={!formDirty || saving || !displayName.trim() || !legalReady}>
            {saving ? "Saving" : "Save changes"}
          </Button>
        </div>
      </form>
      <EmploymentContacts />
    </section>
  );
}

/**
 * The owner's legal name: the name on their ID, which documents and
 * signatures read. Given at the first step of setup; changed here, and each
 * change goes to the audit log. Shown only where this account is the owner.
 */
function OwnerLegalNames({
  register,
  onEdit,
}: {
  readonly register: RegisterLegalName;
  readonly onEdit: () => void;
}) {
  const workspaces = useAccountWorkspaces();
  const owned = ownedWorkspaces(workspaces.data);
  if (owned.length === 0) return null;

  return (
    <fieldset className="account-fieldset">
      <legend>Legal name</legend>
      <p className="account-fieldset-hint">
        As it appears on your ID. Documents and signatures use it; every change
        is recorded.
      </p>
      {owned.map((workspace) => (
        <OwnerLegalNameBlock
          key={workspace.id}
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          showName={owned.length > 1}
          register={register}
          onEdit={onEdit}
        />
      ))}
    </fieldset>
  );
}

function OwnerLegalNameBlock({
  workspaceId,
  workspaceName,
  showName,
  register,
  onEdit,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly showName: boolean;
  readonly register: RegisterLegalName;
  readonly onEdit: () => void;
}) {
  const legalName = useOwnLegalName(workspaceId);
  // Kept above the fields, which start over when the saved name comes back.
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
    <OwnerLegalNameFields
      // A saved name comes back from the server and starts a clean draft.
      key={JSON.stringify(legalName.data)}
      workspaceId={workspaceId}
      workspaceName={showName ? workspaceName : null}
      initial={legalName.data ?? { firstName: "", middleName: "", lastName: "" }}
      saveName={save.mutateAsync}
      register={register}
      onEdit={onEdit}
    />
  );
}

function OwnerLegalNameFields({
  workspaceId,
  workspaceName,
  initial,
  saveName,
  register,
  onEdit,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string | null;
  readonly initial: OwnerLegalName;
  readonly saveName: (name: OwnerLegalName) => Promise<void>;
  readonly register: RegisterLegalName;
  readonly onEdit: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const dirty =
    draft.firstName !== initial.firstName ||
    draft.middleName !== initial.middleName ||
    draft.lastName !== initial.lastName;
  const ready = draft.firstName.trim() !== "" && draft.lastName.trim() !== "";

  useEffect(() => {
    register(workspaceId, {
      dirty,
      ready,
      save: () =>
        saveName({
          firstName: draft.firstName.trim(),
          middleName: draft.middleName.trim(),
          lastName: draft.lastName.trim(),
        }),
      reset: () => setDraft(initial),
    });
  }, [dirty, draft, initial, ready, register, saveName, workspaceId]);
  useEffect(() => () => register(workspaceId, null), [register, workspaceId]);

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
        // Only asked for once this name is being changed: an untouched empty
        // one must not stop the rest of the profile from saving.
        required={part !== "middleName" && dirty}
        onChange={(event) => {
          onEdit();
          setDraft({ ...draft, [part]: event.target.value });
        }}
      />
    </label>
  );

  return (
    <div className="account-legal-name">
      {workspaceName ? <strong>{workspaceName}</strong> : null}
      <div className="account-field-grid account-legal-name-grid">
        {input("firstName", "First name", "first")}
        {input("middleName", "Middle name", "middle")}
        {input("lastName", "Last name", "last")}
      </div>
    </div>
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
        <h2 id="account-employment-title">Emergency contact</h2>
        <p>Kept by each workspace separately, and yours to correct.</p>
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
      <div className="account-field-grid account-contact-grid">
        <label className="account-field" htmlFor={field("preferred")}>
          <span>
            Name used here<span className="field-optional">optional</span>
          </span>
          <input
            id={field("preferred")}
            value={preferred}
            maxLength={80}
            onChange={(event) => setPreferred(event.target.value)}
          />
          <small>This workspace may need to approve it.</small>
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
      </div>
      <div className="account-field-grid account-contact-grid">
        <label className="account-field" htmlFor={field("contact-name")}>
          <span>Contact name</span>
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
          <span>Contact phone</span>
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
